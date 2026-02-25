use std::fs;
use std::path::Path;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use std::fs::File;
use sysinfo::{System, ProcessesToUpdate};
use app_lib::config::load_preferences;
use tar::Builder;
use flate2::write::GzEncoder;
use flate2::Compression;

fn main() {
    println!("LogBackUpTool started. Monitoring VRChat.exe...");

    let mut sys = System::new_all();
    let mut vrchat_was_running = false;
    let mut is_startup = true;

    // ポリシーチェック（起動時）
    let prefs = load_preferences();
    if let Ok(backup_dir) = prefs.get_effective_target_dir() {
        if let Err(e) = apply_retention_policy(&backup_dir, is_startup) {
            eprintln!("Retention policy error on startup: {}", e);
        }
    }

    // 定数
    let loop_interval = Duration::from_secs(5);
    let wait_after_exit = Duration::from_secs(5); // VRChat終了後のハンドル解放待ち

    loop {
        sys.refresh_processes(ProcessesToUpdate::All, true);

        // プロセスの存在確認
        let mut vrchat_running = false;
        let mut steamvr_running = false;

        for process in sys.processes().values() {
            let name = process.name().to_string_lossy().to_lowercase();
            if name == "vrchat.exe" || name == "vrchat" {
                vrchat_running = true;
            }
            if name == "vrserver.exe" || name == "vrserver" || name == "vrmonitor.exe" || name == "vrmonitor" {
                steamvr_running = true;
            }
        }

        // SteamVRが終了していれば、このツールも終了する
        if !steamvr_running {
            println!("SteamVR is not running. Exiting LogBackUpTool.");
            break;
        }

        // VRChatの終了検知
        if !vrchat_running && vrchat_was_running {
            println!("VRChat.exe exit detected. Waiting for file locks to release...");
            thread::sleep(wait_after_exit);

            if let Err(e) = backup_logs_impl() {
                eprintln!("Failed to backup logs: {}", e);
            } else {
                println!("Logs backed up successfully.");
                
                // バックアップ成功後に再度ポリシーチェック (起動時でないため警告は出ない)
                let prefs = load_preferences();
                if let Ok(backup_dir) = prefs.get_effective_target_dir() {
                    let _ = apply_retention_policy(&backup_dir, false);
                }
            }
        }

        vrchat_was_running = vrchat_running;

        // CPU負荷軽減のためのスリープ
        thread::sleep(loop_interval);
    }
}

fn backup_logs_impl() -> Result<(), String> {
    let home_dir = std::env::var("USERPROFILE").map_err(|_| "Failed to get USERPROFILE")?;
    let src_log_dir = Path::new(&home_dir).join("AppData\\LocalLow\\VRChat\\VRChat");
    let prefs = load_preferences();
    let backup_log_dir = prefs.get_effective_target_dir()?;

    if !backup_log_dir.exists() {
        fs::create_dir_all(&backup_log_dir)
            .map_err(|e| format!("Failed to create backup dir: {}", e))?;
    }

    if src_log_dir.exists() {
        let entries = fs::read_dir(&src_log_dir)
            .map_err(|e| format!("Failed to read VRChat log directory: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.starts_with("output_log_") && name.ends_with(".txt") {
                        let dest_path = backup_log_dir.join(name);
                        
                        // コピー再試行ロジック（最大3回、指数バックオフ）
                        let mut max_retries = 3;
                        let mut current_wait = Duration::from_secs(2);
                        
                        loop {
                            match copy_file_if_newer(&path, &dest_path) {
                                Ok(_) => break, // 成功
                                Err(e) => {
                                    if max_retries > 0 {
                                        eprintln!("Copy failed for {}, retrying in {:?}... Error: {}", name, current_wait, e);
                                        thread::sleep(current_wait);
                                        current_wait *= 2;
                                        max_retries -= 1;
                                    } else {
                                        eprintln!("Final copy attempt failed for {}: {}", name, e);
                                        break; // 諦める
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

fn copy_file_if_newer(src: &Path, dest: &Path) -> std::io::Result<()> {
    if !dest.exists() {
        fs::copy(src, dest)?;
    } else {
        let src_meta = fs::metadata(src)?;
        let dest_meta = fs::metadata(dest)?;
        
        let src_time = src_meta.modified()?;
        let dest_time = dest_meta.modified()?;
        
        // タイムスタンプが新しければ上書きコピー
        if src_time > dest_time {
            fs::copy(src, dest)?;
        }
    }
    Ok(())
}

fn apply_retention_policy(backup_dir: &Path, _is_startup: bool) -> Result<(), String> {
    if !backup_dir.exists() {
        return Ok(());
    }

    let entries = fs::read_dir(backup_dir).map_err(|e| format!("Failed to read dir: {}", e))?;
    let mut txt_files = Vec::new();
    let mut total_txt_size: u64 = 0;
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();

    let prefs = load_preferences();
    let max_dir_size: u64 = (prefs.max_log_capacity_gb * 1024.0 * 1024.0 * 1024.0) as u64; 
    let target_archive_size: u64 = max_dir_size / 2;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() { continue; }
        
        if let Ok(meta) = fs::metadata(&path) {
            let modified = meta.modified().unwrap_or(SystemTime::now())
                               .duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();

            // txtのみ容量監視対象とする
            if path.extension().and_then(|e| e.to_str()) == Some("txt") {
                let size = meta.len();
                txt_files.push((path, modified, size));
                total_txt_size += size;
            }
        }
    }

    // 容量上限超えチェック
    if total_txt_size > max_dir_size {
        println!("Log directory exceeds max capacity. Compressing oldest half...");
        // 古い順にソート (modified昇順)
        txt_files.sort_by_key(|k| k.1);

        let mut to_compress = Vec::new();
        let mut accum_size = 0;

        for (path, _, size) in txt_files {
            to_compress.push(path.clone());
            accum_size += size;
            if accum_size >= target_archive_size {
                break;
            }
        }

        if !to_compress.is_empty() {
            let archive_name = format!("logs_archive_{}.tar.gz", now);
            let archive_path = backup_dir.join(archive_name);
            
            match File::create(&archive_path) {
                Ok(tar_gz) => {
                    let enc = GzEncoder::new(tar_gz, Compression::default());
                    let mut tar = Builder::new(enc);
                    let mut success = true;

                    for path in &to_compress {
                        if let Some(name) = path.file_name() {
                            if let Ok(mut f) = File::open(path) {
                                if tar.append_file(name, &mut f).is_err() {
                                    success = false;
                                }
                            }
                        }
                    }
                    
                    if let Ok(tar_inner) = tar.into_inner() {
                        if tar_inner.finish().is_ok() && success {
                            // 成功したら元のファイルを削除
                            for path in to_compress {
                                let _ = fs::remove_file(path);
                            }
                            println!("Compression completed.");
                        } else {
                            eprintln!("Compression partially failed.");
                        }
                    }
                }
                Err(e) => eprintln!("Failed to create archive file: {}", e),
            }
        }
    }

    Ok(())
}
