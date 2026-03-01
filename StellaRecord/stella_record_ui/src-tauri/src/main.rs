#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod planetarium;

use std::process::Command;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use sysinfo::{System, ProcessesToUpdate};
use stella_record_ui::config::{
    load_polaris_setting, load_planetarium_setting,
};
use std::fs;
use std::io::{BufRead, BufReader};
use tauri::Emitter;

// §5: STELLA_RECORD.exe — Polaris設定・Planetarium設定・手動バックアップ


/// §5.4 手動バックアップ: Polaris.exe 未起動 & VRChat 未起動の場合のみ実行可能
#[tauri::command]
fn execute_manual_backup() -> Result<String, String> {
    let mut sys = System::new_all();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let mut polaris_running = false;
    let mut vrchat_running = false;

    for p in sys.processes().values() {
        let name = p.name().to_string_lossy().to_lowercase();
        if name == "vrchat.exe" || name == "vrchat" {
            vrchat_running = true;
        }
        if name == "polaris.exe" || name == "polaris" {
            polaris_running = true;
        }
    }

    if vrchat_running {
        return Err("VRChatが起動中です。手動バックアップを実行する前に終了してください。".to_string());
    }
    if polaris_running {
        return Err("Polaris が既に起動しています。常駐アプリが自動バックアップを管理しています。".to_string());
    }

    // 手動バックアップ処理
    let setting = load_polaris_setting();
    let src_dir = {
        let appdata = std::env::var("APPDATA").map_err(|_| "Failed to get APPDATA")?;
        std::path::Path::new(&appdata).join("..\\LocalLow\\VRChat\\VRChat")
    };
    let dest_dir = setting.get_effective_archive_dir()?;

    if !dest_dir.exists() {
        std::fs::create_dir_all(&dest_dir)
            .map_err(|e| format!("Failed to create archive dir: {}", e))?;
    }

    let mut count = 0;
    if src_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&src_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if name.starts_with("output_log_") && name.ends_with(".txt") {
                            let dest_path = dest_dir.join(name);
                            if !dest_path.exists() {
                                if std::fs::copy(&path, &dest_path).is_ok() {
                                    count += 1;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(format!("完了しました。{}個のログファイルをバックアップしました。", count))
}

/// §5.2 起動シーケンス / §5.5 Planetarium手動最新化・強制Sync
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
    #[cfg(windows)]
    {
        Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Err("Unsupported platform".to_string())
    }
}

#[tauri::command]
fn get_polaris_logs() -> Result<Vec<String>, String> {
    let local = std::env::var("LOCALAPPDATA").map_err(|_| "LOCALAPPDATA not found")?;
    let log_path = std::path::Path::new(&local).join("CosmoArtsStore\\STELLARECORD\\Polaris\\polaris_appinfo.log");
    
    if !log_path.exists() {
        return Ok(vec!["ログファイルが見つかりません。".to_string()]);
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        use winapi::um::winnt::FILE_SHARE_READ;
        let file = fs::OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ)
            .open(log_path).map_err(|e| e.to_string())?;
        let reader = BufReader::new(file);
        let mut lines: Vec<String> = reader.lines().filter_map(|l| l.ok()).collect();
        if lines.len() > 100 {
            lines = lines.split_off(lines.len() - 100);
        }
        Ok(lines)
    }
    #[cfg(not(windows))]
    {
        let file = fs::File::open(log_path).map_err(|e| e.to_string())?;
        let reader = BufReader::new(file);
        let mut lines: Vec<String> = reader.lines().filter_map(|l| l.ok()).collect();
        if lines.len() > 100 {
            lines = lines.split_off(lines.len() - 100);
        }
        Ok(lines)
    }
}

#[derive(Clone, serde::Serialize)]
struct PlanetariumPayload {
    status: String,
    progress: String,
    is_running: bool,
}

#[tauri::command]
fn launch_planetarium(handle: tauri::AppHandle, _mode: String) -> Result<String, String> {
    let setting = load_planetarium_setting();
    let tracking = setting.enableUserTracking;
    let db_path = setting.get_effective_db_path()?;
    let archive_dir = setting.get_effective_archive_dir()?;
    
    std::thread::spawn(move || {
        let result = planetarium::run_diff_import(db_path, archive_dir, tracking, |status, progress| {
            let _ = handle.emit("planetarium-progress", PlanetariumPayload {
                status: status.clone(),
                progress: progress.clone(),
                is_running: true,
            });
        });
        
        match result {
            Ok(_) => {
                let _ = handle.emit("planetarium-progress", PlanetariumPayload {
                    status: "完了".to_string(),
                    progress: "100%".to_string(),
                    is_running: false,
                });
            }
            Err(e) => {
                let _ = handle.emit("planetarium-progress", PlanetariumPayload {
                    status: format!("エラー: {}", e),
                    progress: "0%".to_string(),
                    is_running: false,
                });
            }
        }
        let _ = handle.emit("planetarium-finished", ());
    });
    
    Ok("Planetarium を開始しました。".to_string())
}

#[tauri::command]
fn get_storage_status() -> Result<(u64, u64), String> {
    let setting = load_polaris_setting();
    let archive_dir = setting.get_effective_archive_dir()?;
    
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

/// §308/§6.3 強制終了機能
#[tauri::command]
fn cancel_planetarium() -> Result<(), String> {
    let mut sys = System::new_all();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    for p in sys.processes().values() {
        let name = p.name().to_string_lossy().to_lowercase();
        if name == "planetarium.exe" || name == "planetarium" {
            p.kill();
        }
    }
    Ok(())
}

#[derive(Debug, serde::Serialize)]
pub struct TableData {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

#[tauri::command]
fn get_db_tables() -> Result<Vec<String>, String> {
    let setting = load_planetarium_setting();
    let db_path = setting.get_effective_db_path()?;

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
    let setting = load_planetarium_setting();
    let db_path = setting.get_effective_db_path()?;

    if !db_path.exists() { return Err("Database file not found".to_string()); }

    let conn = rusqlite::Connection::open(db_path).map_err(|e| e.to_string())?;
    
    // SQLステートメントのバリデーション (テーブル名が英数字+下線のみかチェック)
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
    let setting = load_planetarium_setting();
    let db_path = setting.get_effective_db_path()?;

    if !db_path.exists() { return Err("Database file not found".to_string()); }

    let conn = rusqlite::Connection::open(db_path).map_err(|e| e.to_string())?;
    
    // 今日（JSTを想定しつつ素朴にDATETIME比較）のデータを削除
    let affected = conn.execute(
        "DELETE FROM world_visits WHERE date(join_time) = date('now', 'localtime')",
        []
    ).map_err(|e| e.to_string())?;

    Ok(format!("今日分のデータ {} 件を削除しました。", affected))
}

#[tauri::command]
fn wipe_database() -> Result<String, String> {
    let setting = load_planetarium_setting();
    let db_path = setting.get_effective_db_path()?;

    if !db_path.exists() { return Err("データベースファイルが見つかりません。".to_string()); }

    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;

    // 外部キー順に従い、子テーブルから削除（player_visits を忘れると削除が不完全になる）
    conn.execute("DELETE FROM player_visits", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM avatar_changes", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM video_playbacks", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM world_visits", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM players", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM app_sessions", []).map_err(|e| e.to_string())?;

    // SQLiteのバキュームを実行してファイルサイズを削減
    let _ = conn.execute("VACUUM", []);

    Ok("データベースを完全に初期化しました。".to_string())
}

#[tauri::command]
fn read_launcher_json(section: &str) -> Vec<stella_record_ui::config::AppCard> {
    let filename = if section == "pleiades" { "PleiadesPath.json" } else { "JewelBoxPath.json" };
    stella_record_ui::config::load_launcher_json(filename)
}

#[tauri::command]
async fn start_polaris() -> Result<String, String> {
    let mut sys = System::new_all();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    let is_running = sys.processes().values().any(|p| {
        let n = p.name().to_string_lossy().to_lowercase();
        n == "polaris.exe" || n == "polaris"
    });
    
    if is_running {
        return Ok("Polaris は既に起動しています。".to_string());
    }

    let polaris_exe = {
        let local = std::env::var("LOCALAPPDATA").map_err(|_| "LOCALAPPDATA not found".to_string())?;
        std::path::Path::new(&local).join("CosmoArtsStore\\STELLARECORD\\Polaris\\polaris.exe")
    };

    if !polaris_exe.exists() {
        return Err("Polaris.exe が見つかりません。".to_string());
    }

    let mut cmd = Command::new(polaris_exe);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok("Polaris を起動しました。".to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            execute_manual_backup,
            launch_planetarium,
            cancel_planetarium,
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
        ])
        .setup(|app| {
            // Polaris 常駐監視スレッド (3秒おきに emit)
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut sys = System::new_all();
                loop {
                    sys.refresh_processes(ProcessesToUpdate::All, true);
                    let is_running = sys.processes().values().any(|p| {
                        let n = p.name().to_string_lossy().to_lowercase();
                        n == "polaris.exe" || n == "polaris"
                    });
                    let _ = handle.emit("polaris-status", is_running);
                    std::thread::sleep(std::time::Duration::from_secs(3));
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
