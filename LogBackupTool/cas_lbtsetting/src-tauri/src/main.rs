#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use lbt_core::config::{load_preferences, save_preferences as core_save, Preferences};
use std::process::Command;
use sysinfo::{System, ProcessesToUpdate};

#[tauri::command]
fn get_config() -> Preferences {
    load_preferences()
}

#[tauri::command]
fn save_config(prefs: Preferences) -> Result<(), String> {
    core_save(&prefs)?;

    // スタートアップ設定 (レジストリ) の同期
    let exe_dir = std::env::current_exe().map_err(|e| format!("Get current exe failed: {}", e))?;
    let backend_dir = exe_dir.parent().unwrap().join("Backend");
    let onsite_exe = backend_dir.join("OnsiteLogBackupTool.exe");
    let observer_exe = backend_dir.join("LBTAppObserver.exe");

    let reg_cmd = if prefs.enableStartup {
        format!(
            "Reg Add 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' /v 'OnsiteLogBackupTool' /t REG_SZ /d '\"{}\"' /f; \
             Reg Add 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' /v 'LBTAppObserver' /t REG_SZ /d '\"{}\"' /f",
            onsite_exe.to_string_lossy(),
            observer_exe.to_string_lossy()
        )
    } else {
        "Reg Delete 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' /v 'OnsiteLogBackupTool' /f; \
         Reg Delete 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' /v 'LBTAppObserver' /f".to_string()
    };

    let _ = Command::new("powershell")
        .args(&["-Command", &reg_cmd])
        .output();

    Ok(())
}

#[tauri::command]
fn execute_manual_backup() -> Result<String, String> {
    let mut sys = System::new_all();
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let mut onsite_running = false;
    let mut vrchat_running = false;

    // Check for running processes
    for p in sys.processes().values() {
        let name = p.name().to_string_lossy().to_lowercase();
        if name == "vrchat.exe" || name == "vrchat" {
            vrchat_running = true;
        }
        if name == "onsitelogbackuptool.exe" || name == "onsitelogbackuptool" {
            onsite_running = true;
        }
    }

    if vrchat_running {
        return Err("VRChatが起動中です。手動バックアップを実行する前に終了してください。".to_string());
    }
    
    if onsite_running {
        return Err("OnsiteLogBackupTool が既に起動しています。手動バックアップは常駐アプリを終了してから実行してください。".to_string());
    }

    // VRChat is not running and Onsite is not running: DO MANUAL BACKUP
    let prefs = load_preferences();
    
    // We execute the backup logic directly here or via invoking the onsite tool.
    // For manual backup, since the logic is small, we can inline it or start OnsiteLogBackupTool
    // But since Onsite is a long running background worker, we should just inline the folder copy.
    let home = std::env::var("USERPROFILE").map_err(|_| "Failed to get USERPROFILE")?;
    let src_dir = std::path::Path::new(&home).join("AppData\\LocalLow\\VRChat\\VRChat");
    let dest_dir = prefs.get_effective_target_dir()?;

    if !dest_dir.exists() {
        std::fs::create_dir_all(&dest_dir).map_err(|e| format!("Failed to create backup dir: {}", e))?;
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
                            } else {
                                if let (Ok(sm), Ok(dm)) = (std::fs::metadata(&path), std::fs::metadata(&dest_path)) {
                                    if let (Ok(st), Ok(dt)) = (sm.modified(), dm.modified()) {
                                        if st > dt {
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
            }
        }
    }

    Ok(format!("完了しました。{} 個のログファイルをバックアップしました。", count))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            execute_manual_backup
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
