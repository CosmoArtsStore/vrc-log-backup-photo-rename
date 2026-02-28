#![windows_subsystem = "windows"]

mod config;
mod logger;

use config::{load_setting, save_setting, PolarisSetting};
use logger::{log_info, truncate_log};
use sysinfo::{System, ProcessesToUpdate};
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use walkdir::WalkDir;
use zip::ZipArchive;

// --- Migration & Import logic ---

/// §4.1 旧 LogBackupTool からの移行、または §12 archiveパス移動
fn run_migration(setting: &mut PolarisSetting) {
    if setting.migrationStatus != "in_progress" || setting.migrationSourcePath.is_empty() {
        return;
    }

    log_info("Polaris", &format!("移行処理を開始します: {} -> {}", setting.migrationSourcePath, setting.archivePath));

    let src = Path::new(&setting.migrationSourcePath);
    let dest = match setting.get_effective_archive_dir() {
        Ok(d) => d,
        Err(e) => {
            log_info("Polaris", &format!("移行失敗 (dest取得エラー): {}", e));
            return;
        }
    };

    if !dest.exists() {
        let _ = fs::create_dir_all(&dest);
    }

    let mut success = true;

    // ソースが zip の場合（旧 LBT のエクスポート等）
    if src.is_file() && src.extension().and_then(|s| s.to_str()) == Some("zip") {
        if let Err(e) = extract_zip_to_dir(src, &dest) {
            log_info("Polaris", &format!("Zip展開失敗: {}", e));
            success = false;
        }
    } else if src.is_dir() {
        // ソースがディレクトリの場合（パス変更による移動、または旧 LBT フォルダ）
        for entry in WalkDir::new(src).min_depth(1).max_depth(1) {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let path = entry.path();
            if path.is_file() {
                let filename = path.file_name().unwrap();
                let dest_path = dest.join(filename);
                if let Err(e) = fs::copy(path, &dest_path) {
                    log_info("Polaris", &format!("ファイルコピー失敗 ({}): {}", filename.to_string_lossy(), e));
                    success = false;
                    break;
                }
            }
        }
        
        // §12 フォルダ移動時: コピー成功確認後に元フォルダを削除
        if success {
            log_info("Polaris", "フォルダ内全ファイルのコピーに成功しました。元フォルダを削除します。");
            // 注意: src 自体を消すと共有違反になる可能性があるので中身だけ消すか、
            // 空になったら消す。
            let _ = fs::remove_dir_all(src);
        }
    } else {
        log_info("Polaris", "移行元が見通せません（ファイルでもディレクトリでもない）");
        success = false;
    }

    if success {
        setting.migrationStatus = "done".to_string();
        setting.migrationSourcePath = String::new();
        let _ = save_setting(setting);
        log_info("Polaris", "移行処理が完了しました。");
    } else {
        log_info("Polaris", "移行処理中にエラーが発生しました。次回起動時に再試行します。");
    }
}

fn extract_zip_to_dir(zip_path: &Path, dest_dir: &Path) -> io::Result<()> {
    let file = fs::File::open(zip_path)?;
    let mut archive = ZipArchive::new(file)?;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let outpath = match file.enclosed_name() {
            Some(path) => dest_dir.join(path.file_name().unwrap()),
            None => continue,
        };
        if (*file.name()).ends_with('/') {
            fs::create_dir_all(&outpath)?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p)?;
                }
            }
            let mut outfile = fs::File::create(&outpath)?;
            io::copy(&mut file, &mut outfile)?;
        }
    }
    Ok(())
}

// --- Backup logic ---

/// §4.2 バックアップ対象: %APPDATA%\..\LocalLow\VRChat\VRChat\output_log*.txt
fn backup_logs(setting: &PolarisSetting) -> usize {
    let appdata = match std::env::var("APPDATA") {
        Ok(v) => v,
        Err(_) => return 0,
    };
    let src_dir = Path::new(&appdata).join("..\\LocalLow\\VRChat\\VRChat");
    let dest_dir = match setting.get_effective_archive_dir() {
        Ok(d) => d,
        Err(_) => return 0,
    };

    if !dest_dir.exists() {
        let _ = fs::create_dir_all(&dest_dir);
    }

    let mut count = 0;
    if let Ok(entries) = fs::read_dir(&src_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.starts_with("output_log_") && name.ends_with(".txt") {
                        let dest_path = dest_dir.join(name);
                        // §4.2 バックアップ重複ガード: 更新日時比較
                        let need_copy = if !dest_path.exists() {
                            true
                        } else {
                            if let (Ok(sm), Ok(dm)) = (fs::metadata(&path), fs::metadata(&dest_path)) {
                                if let (Ok(st), Ok(dt)) = (sm.modified(), dm.modified()) {
                                    st > dt
                                } else { false }
                            } else { false }
                        };

                        if need_copy {
                            if fs::copy(&path, &dest_path).is_ok() {
                                count += 1;
                            }
                        }
                    }
                }
            }
        }
    }
    count
}

/// §4.2③ 容量監視
fn check_capacity(setting: &PolarisSetting) {
    if let Ok(archive_dir) = setting.get_effective_archive_dir() {
        let mut total = 0u64;
        for entry in WalkDir::new(&archive_dir).into_iter().filter_map(|e| e.ok()) {
            if entry.file_type().is_file() {
                total += entry.metadata().map(|m| m.len()).unwrap_or(0);
            }
        }

        if total >= setting.capacityThresholdBytes {
            let gb = total as f64 / 1_073_741_824.0;
            let threshold_gb = setting.capacityThresholdBytes as f64 / 1_073_741_824.0;
            log_info("Polaris", &format!(
                "[WARNING] archiveが容量警告閾値を超過しています: {:.2} GB / {:.2} GB",
                gb, threshold_gb
            ));
        }
    }
}

// --- Main Loop ---

fn main() {
    truncate_log();
    log_info("Polaris", "起動しました");

    let mut setting = load_setting_with_tmp_copy();
    
    // §4.1 / §12 移行処理の実装
    run_migration(&mut setting);

    // 起動時バックアップ
    let count = backup_logs(&setting);
    log_info("Polaris", &format!("起動時バックアップ完了: {}件", count));
    check_capacity(&setting);

    register_application_restart();

    let setting_arc = Arc::new(Mutex::new(setting));
    let setting_clone = setting_arc.clone();

    // VRChat 監視スレッド
    thread::spawn(move || {
        let mut vrchat_was_running = false;
        let mut sys = System::new();
        loop {
            thread::sleep(Duration::from_secs(5));
            sys.refresh_processes(ProcessesToUpdate::All, true);

            let vrchat_now = sys.processes().values().any(|p| {
                let n = p.name().to_string_lossy().to_lowercase();
                n == "vrchat.exe" || n == "vrchat"
            });

            if vrchat_now && !vrchat_was_running {
                log_info("Polaris", "VRChat 起動検知");
                vrchat_was_running = true;
            }

            if !vrchat_now && vrchat_was_running {
                log_info("Polaris", "VRChat 終了検知。バックアップを開始します。");
                let current_setting = load_setting_with_tmp_copy();
                {
                    let mut s = setting_clone.lock().unwrap();
                    *s = current_setting.clone();
                }
                let count = backup_logs(&current_setting);
                log_info("Polaris", &format!("終了時バックアップ完了: {}件", count));
                check_capacity(&current_setting);
                vrchat_was_running = false;
            }
        }
    });

    run_tray_loop();
}

// --- Utils ---

fn load_setting_with_tmp_copy() -> PolarisSetting {
    if let Ok(path) = config::get_setting_path() {
        if path.exists() {
            let tmp_path = path.with_extension("json.tmp");
            if fs::copy(&path, &tmp_path).is_ok() {
                if let Ok(content) = fs::read_to_string(&tmp_path) {
                    if let Ok(s) = serde_json::from_str::<PolarisSetting>(&content) {
                        let _ = fs::remove_file(&tmp_path);
                        return s;
                    }
                }
                let _ = fs::remove_file(&tmp_path);
            }
        }
    }
    load_setting()
}

fn register_application_restart() {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use winapi::um::winbase::RegisterApplicationRestart;

    let empty: Vec<u16> = OsStr::new("").encode_wide().chain(std::iter::once(0)).collect();
    unsafe {
        RegisterApplicationRestart(empty.as_ptr(), 0);
    }
}

fn run_tray_loop() {
    use tao::event_loop::{ControlFlow, EventLoopBuilder};
    use tray_icon::{
        menu::{Menu, MenuItem, MenuEvent},
        TrayIconBuilder,
    };

    let event_loop = EventLoopBuilder::new().build();
    let menu = Menu::new();
    let quit_item = MenuItem::new("終了", true, None);
    let quit_id = quit_item.id().clone();
    menu.append(&quit_item).unwrap();

    // §4.5 トレイアイコンの設定 (icon.png 等をベースパスから解決)
    let icon_path = std::env::current_exe()
        .map(|p| p.parent().unwrap().join("icon.png"))
        .unwrap_or_else(|_| PathBuf::from("icon.png"));

    let icon = if icon_path.exists() {
        if let Ok(img) = image::open(&icon_path) {
            let (width, height) = (img.width(), img.height());
            tray_icon::Icon::from_rgba(img.into_rgba8().into_raw(), width, height).ok()
        } else { None }
    } else { None };

    let _tray = TrayIconBuilder::new()
        .with_menu(Box::new(menu))
        .with_tooltip("Polaris - StellaRecord")
        .with_icon(icon.unwrap_or_else(|| tray_icon::Icon::from_rgba(vec![0; 4], 1, 1).unwrap()))
        .build()
        .expect("Failed to create tray icon");

    let menu_channel = MenuEvent::receiver();

    event_loop.run(move |_event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        if let Ok(menu_event) = menu_channel.try_recv() {
            if menu_event.id == quit_id {
                log_info("Polaris", "正常終了");
                *control_flow = ControlFlow::Exit;
            }
        }
    });
}
