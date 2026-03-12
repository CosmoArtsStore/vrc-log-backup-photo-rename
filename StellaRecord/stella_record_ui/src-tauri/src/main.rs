#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]


use std::process::Command;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use sysinfo::{System, ProcessesToUpdate};
use stella_record_ui::config::{
    load_polaris_setting, load_stellarecord_setting,
};
use stella_record_ui::{log_warn, log_err_lib, analyze};
use std::fs;
use std::io::{BufRead, BufReader};
use tauri::Emitter;
use std::path::PathBuf;
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

// ── パス取得 ────────────────────────────────

fn get_component_install_dir(name: &str) -> Option<PathBuf> {
    let key_path = format!("Software\\CosmoArtsStore\\STELLAProject\\{}", name);
    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(&key_path).ok()?;
    let path: String = key.get_value("InstallLocation").ok()?;
    Some(PathBuf::from(path))
}

fn get_stellarecord_install_dir() -> Option<PathBuf> {
    get_component_install_dir("StellaRecord")
}

fn get_polaris_install_dir() -> Option<PathBuf> {
    get_component_install_dir("Polaris")
}

fn get_polaris_exe_path() -> Option<PathBuf> {
    Some(get_polaris_install_dir()?.join("Polaris.exe"))
}

fn log_err(msg: &str) {
    if let Some(path) = get_stellarecord_install_dir().map(|p| p.join("info.log")) {
        if let Ok(mut log) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
            let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
            let _ = std::io::Write::write_fmt(&mut log, format_args!("[{}] [ERROR] {}\n", now, msg));
        }
    }
}

// ── Commands ────────────────────────────────────────

#[tauri::command]
fn list_archive_files() -> Result<Vec<String>, String> {
    let setting = load_polaris_setting();
    let archive_dir = setting.get_effective_archive_dir().ok_or_else(|| "アーカイブディレクトリが見つかりません。".to_string())?;
    let zst_dir = archive_dir.join("zst");
    let mut files = Vec::new();

    if zst_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&zst_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if name.ends_with(".tar.zst") {
                            files.push(name.to_string());
                        }
                    }
                }
            }
        }
    }
    files.sort();
    files.reverse();
    Ok(files)
}

#[tauri::command]
fn compress_logs() -> Result<String, String> {
    let setting = load_polaris_setting();
    let archive_dir = setting.get_effective_archive_dir().ok_or_else(|| "アーカイブディレクトリが見つかりません。".to_string())?;
    if !archive_dir.exists() {
        return Err("アーカイブディレクトリが存在しません。".to_string());
    }

    let zst_dir = archive_dir.join("zst");
    std::fs::create_dir_all(&zst_dir).map_err(|e| e.to_string())?;

    let mut count = 0;
    let entries = std::fs::read_dir(&archive_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with("output_log_") && name.ends_with(".txt") {
                    let zst_name = format!("{}.tar.zst", name);
                    let zst_path = zst_dir.join(&zst_name);
                    if !zst_path.exists() {
                        compress_single_file(&path, &zst_path)?;
                        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
                        count += 1;
                    }
                }
            }
        }
    }

    Ok(format!("完了しました。{}個のファイルを圧縮・移動しました。", count))
}

fn compress_single_file(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    let file = std::fs::File::create(dst).map_err(|e| e.to_string())?;
    let enc = zstd::stream::Encoder::new(file, 3).map_err(|e| e.to_string())?.auto_finish();
    let mut tar = tar::Builder::new(enc);
    
    let file_name = src.file_name().ok_or("Invalid file name")?;
    let mut f = std::fs::File::open(src).map_err(|e| e.to_string())?;
    tar.append_file(file_name, &mut f).map_err(|e| e.to_string())?;
    
    tar.finish().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn launch_enhanced_import(handle: tauri::AppHandle, file_names: Vec<String>) -> Result<String, String> {
    let setting = load_stellarecord_setting();
    let db_path = setting.get_effective_db_path().ok_or_else(|| "データベースパスが見つかりません。".to_string())?;
    let archive_dir = setting.get_effective_archive_dir().ok_or_else(|| "アーカイブディレクトリが見つかりません。".to_string())?;
    let zst_dir = archive_dir.join("zst");

    let mut target_paths = Vec::new();
    for name in &file_names {
        let path = zst_dir.join(name);
        if !path.exists() {
            return Err(format!("ファイルが見つかりません: {}", name));
        }
        target_paths.push(path);
    }
    let total = target_paths.len();

    std::thread::spawn(move || {
        for (idx, target_path) in target_paths.into_iter().enumerate() {
            let file_label = target_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            let _ = handle.emit("analyze-progress", AnalyzePayload {
                status: format!("[{}/{}] {}", idx + 1, total, file_label),
                progress: format!("{}%", (idx * 100) / total.max(1)),
                is_running: true,
            });

            let result = analyze::run_enhanced_import(
                db_path.clone(),
                target_path,
                |status, progress| {
                    let _ = handle.emit("analyze-progress", AnalyzePayload {
                        status,
                        progress,
                        is_running: true,
                    });
                },
            );

            if let Err(e) = result {
                let _ = handle.emit("analyze-progress", AnalyzePayload {
                    status: format!("エラー: {}", e),
                    progress: "0%".to_string(),
                    is_running: false,
                });
                let _ = handle.emit("analyze-finished", ());
                return;
            }
        }

        let _ = handle.emit("analyze-progress", AnalyzePayload {
            status: format!("{}件のインポートが完了しました。", total),
            progress: "100%".to_string(),
            is_running: false,
        });
        let _ = handle.emit("analyze-finished", ());
    });

    Ok(format!("{}件のアーカイブ同期を開始しました。", total))
}

#[tauri::command]
fn decompress_logs(file_names: Vec<String>) -> Result<String, String> {
    let setting = load_polaris_setting();
    let archive_dir = setting.get_effective_archive_dir().ok_or_else(|| "アーカイブディレクトリが見つかりません。".to_string())?;
    let zst_dir = archive_dir.join("zst");

    if !zst_dir.exists() {
        return Err("zst フォルダが存在しません。".to_string());
    }

    let mut success_count = 0;
    let mut skip_count = 0;

    for name in &file_names {
        let zst_path = zst_dir.join(name);
        if !zst_path.exists() {
            return Err(format!("ファイルが見つかりません: {}", name));
        }

        let txt_name = name.replace(".tar.zst", "");
        let txt_path = archive_dir.join(&txt_name);

        if txt_path.exists() {
            skip_count += 1;
            continue;
        }

        let file = std::fs::File::open(&zst_path).map_err(|e| e.to_string())?;
        let decoder = zstd::stream::Decoder::new(file).map_err(|e| e.to_string())?;
        let mut archive = tar::Archive::new(decoder);
        archive.unpack(&archive_dir).map_err(|e| e.to_string())?;

        if !txt_path.exists() {
            return Err(format!("展開に失敗しました: {}", txt_name));
        }

        std::fs::remove_file(&zst_path).map_err(|e| e.to_string())?;
        success_count += 1;
    }

    if skip_count > 0 {
        Ok(format!("{}個を展開しました。{}個は既に展開済みでスキップしました。", success_count, skip_count))
    } else {
        Ok(format!("{}個のアーカイブを展開し、元ファイルを削除しました。", success_count))
    }
}

#[tauri::command]
fn launch_external_app(app_path: &str) -> Result<(), String> {
    let mut cmd = Command::new(app_path);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    cmd.spawn()
        .map_err(|e| format!("起動に失敗しました: {}", e))?;
    Ok(())
}

#[tauri::command]
fn get_polaris_status() -> bool {
    let mut sys = System::new_all();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    sys.processes().values().any(|p| {
        let n = p.name().to_string_lossy().to_lowercase();
        n == "polaris.exe" || n == "polaris"
    })
}

#[tauri::command]
fn open_folder(path: &str) -> Result<(), String> {
    opener::open(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_polaris_logs() -> Result<Vec<String>, String> {
    let log_path = get_polaris_install_dir()
        .map(|p| p.join("info.log"))
        .ok_or_else(|| "Polaris installation not found".to_string())?;
    
    if !log_path.exists() {
        return Ok(vec!["ログファイルが見つかりません。".to_string()]);
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        use windows::Win32::Storage::FileSystem::FILE_SHARE_READ;
        let file = fs::OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ.0)
            .open(log_path).map_err(|e| e.to_string())?;
        let reader = std::io::BufReader::new(file);
        let mut lines: Vec<String> = reader.lines().filter_map(|l| l.ok()).collect();
        if lines.len() > 100 {
            lines = lines.split_off(lines.len() - 100);
        }
        Ok(lines)
    }
    #[cfg(not(windows))]
    {
        Ok(vec!["Unsupported platform".to_string()])
    }
}

#[derive(Clone, serde::Serialize)]
struct AnalyzePayload {
    status: String,
    progress: String,
    is_running: bool,
}

#[tauri::command]
async fn launch_analyze(handle: tauri::AppHandle, _mode: String) -> Result<String, String> {
    let setting = load_stellarecord_setting();
    let db_path = setting.get_effective_db_path().ok_or_else(|| "データベースパスが見つかりません。".to_string())?;
    let archive_dir = setting.get_effective_archive_dir().ok_or_else(|| "アーカイブディレクトリが見つかりません。".to_string())?;
    
    std::thread::spawn(move || {
        let result = analyze::run_diff_import(db_path, archive_dir, |status, progress| {
            let _ = handle.emit("analyze-progress", AnalyzePayload {
                status: status.clone(),
                progress: progress.clone(),
                is_running: true,
            });
        });
        
        match result {
            Ok(_) => {
                let _ = handle.emit("analyze-progress", AnalyzePayload {
                    status: "完了".to_string(),
                    progress: "100%".to_string(),
                    is_running: false,
                });
            }
            Err(e) => {
                let _ = handle.emit("analyze-progress", AnalyzePayload {
                    status: format!("エラー: {}", e),
                    progress: "0%".to_string(),
                    is_running: false,
                });
            }
        }
        let _ = handle.emit("analyze-finished", ());
    });
    
    Ok("Analyze を開始しました。".to_string())
}

#[tauri::command]
fn get_storage_status() -> Result<(u64, u64), String> {
    let setting = load_polaris_setting();
    let archive_dir = setting.get_effective_archive_dir().ok_or_else(|| "アーカイブディレクトリが見つかりません。".to_string())?;
    
    let mut total_size = 0;
    if archive_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&archive_dir) {
            for entry in entries.flatten() {
                if let Ok(meta) = entry.metadata() {
                    if meta.is_file() {
                        total_size += meta.len();
                    }
                }
            }
        }
    }
    
    Ok((total_size, setting.capacityThresholdBytes))
}

#[tauri::command]
async fn cancel_analyze() -> Result<(), String> {
    Ok(())
}

#[derive(Debug, serde::Serialize)]
pub struct TableData {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

#[tauri::command]
fn get_db_tables() -> Result<Vec<String>, String> {
    let setting = load_stellarecord_setting();
    let db_path = setting.get_effective_db_path().ok_or_else(|| "データベースパスが見つかりません。".to_string())?;

    if !db_path.exists() { return Ok(vec![]); }

    let conn = rusqlite::Connection::open(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| row.get(0)).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        if let Ok(v) = row {
            results.push(v);
        }
    }
    Ok(results)
}

#[tauri::command]
fn get_db_table_data(table_name: &str) -> Result<TableData, String> {
    let setting = load_stellarecord_setting();
    let db_path = setting.get_effective_db_path().ok_or_else(|| "データベースパスが見つかりません。".to_string())?;

    if !db_path.exists() { return Err("Database file not found".to_string()); }

    let conn = rusqlite::Connection::open(db_path).map_err(|e| e.to_string())?;
    
    if !table_name.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err("Invalid table name".to_string());
    }

    let sql = format!("SELECT * FROM {} ORDER BY id DESC LIMIT 100", table_name);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    
    let column_count = stmt.column_count();
    let columns: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

    let mut rows = stmt.query([]) .map_err(|e| e.to_string())?;
    let mut results = Vec::new();

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut string_row = Vec::new();
        for i in 0..column_count {
            let value: rusqlite::types::Value = row.get(i).map_err(|e| e.to_string())?;
            string_row.push(match value {
                rusqlite::types::Value::Null => "NULL".to_string(),
                rusqlite::types::Value::Integer(i) => i.to_string(),
                rusqlite::types::Value::Real(f) => f.to_string(),
                rusqlite::types::Value::Text(t) => t,
                rusqlite::types::Value::Blob(_) => "<BLOB>".to_string(),
            });
        }
        results.push(string_row);
    }

    Ok(TableData {
        columns,
        rows: results,
    })
}

#[tauri::command]
fn delete_today_data() -> Result<String, String> {
    let setting = load_stellarecord_setting();
    let db_path = setting.get_effective_db_path().ok_or_else(|| "データベースパスが見つかりません。".to_string())?;

    if !db_path.exists() { return Err("Database file not found".to_string()); }

    let conn = rusqlite::Connection::open(db_path).map_err(|e| e.to_string())?;
    
    let affected = conn.execute(
        "DELETE FROM world_visits WHERE date(join_time) = date('now', 'localtime')",
        []
    ).map_err(|e| e.to_string())?;

    Ok(format!("本日分のデータ {} 件を削除しました。", affected))
}

#[tauri::command]
fn wipe_database() -> Result<String, String> {
    let setting = load_stellarecord_setting();
    let db_path = setting.get_effective_db_path().ok_or_else(|| "データベースパスが見つかりません。".to_string())?;

    if !db_path.exists() { return Err("データベースファイルが見つかりません。".to_string()); }

    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM player_visits", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM avatar_changes", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM video_playbacks", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM world_visits", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM players", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM app_sessions", []).map_err(|e| e.to_string())?;

    let _ = conn.execute("VACUUM", []);

    Ok("データベースを完全に初期化しました。".to_string())
}

#[tauri::command]
fn read_launcher_json(section: &str) -> Vec<stella_record_ui::config::AppCard> {
    let filename = if section == "pleiades" { "pleiades.json" } else { "jewelbox.json" };
    stella_record_ui::config::load_launcher_json(filename)
}

#[tauri::command]
async fn start_polaris() -> Result<String, String> {
    let is_running = get_polaris_status();
    if is_running {
        return Ok("Polaris は既に起動しています。".to_string());
    }

    let polaris_exe = get_polaris_exe_path()
        .ok_or_else(|| "Polaris path could not be determined".to_string())?;

    if !polaris_exe.exists() {
        return Err("Polaris.exe が見つかりません。".to_string());
    }

    let mut cmd = Command::new(polaris_exe);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok("Polaris を起動しました。".to_string())
}

// ── メイン ────────────────────────────────────────

fn main() {
    std::panic::set_hook(Box::new(|info| {
        let location = info.location()
            .map(|l| format!("at {}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "unknown location".to_string());
        let payload = info.payload();
        let msg = if let Some(s) = payload.downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = payload.downcast_ref::<String>() {
            s.clone()
        } else {
            "No error message".to_string()
        };
        if let Some(log_path) = get_stellarecord_install_dir().map(|p| p.join("info.log")) {
            if let Ok(mut log) = std::fs::OpenOptions::new().create(true).append(true).open(log_path) {
                let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
                let _ = std::io::Write::write_fmt(&mut log, format_args!("[{}] [PANIC] {} {}\n", now, msg, location));
            }
        }
        log_err_lib(&format!("[PANIC] {} {}", msg, location));
    }));

    #[cfg(windows)]
    {
        use windows::Win32::Foundation::{ERROR_ALREADY_EXISTS, GetLastError};
        use windows::Win32::System::Threading::CreateMutexW;
        use windows::core::PCWSTR;
        let mutex_name: Vec<u16> = "Global\\StellaRecord_SingleInstance\0".encode_utf16().collect();
        let _ = unsafe { CreateMutexW(None, true, PCWSTR(mutex_name.as_ptr())) };
        if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
            log_err("StellaRecord is already running.");
            std::process::exit(0);
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_archive_files,
            compress_logs,
            decompress_logs,
            launch_enhanced_import,
            launch_analyze,
            cancel_analyze,
            read_launcher_json,
            launch_external_app,
            get_polaris_logs,
            start_polaris,
            get_storage_status,
            get_db_tables,
            get_db_table_data,
            delete_today_data,
            wipe_database,
            open_folder,
            get_polaris_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
