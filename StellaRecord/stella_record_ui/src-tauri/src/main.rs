#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use sysinfo::{System, ProcessesToUpdate};
use stella_record_ui::config::{
    load_polaris_setting, save_polaris_setting, PolarisSetting,
    load_planetarium_setting, save_planetarium_setting, PlanetariumSetting,
};
use std::fs;
use std::io::{BufRead, BufReader};
use tauri::Emitter;

// §5: STELLA_RECORD.exe — Polaris設定・Planetarium設定・手動バックアップ

#[tauri::command]
fn get_polaris_config() -> PolarisSetting {
    load_polaris_setting()
}

#[tauri::command]
fn save_polaris_config(setting: PolarisSetting) -> Result<(), String> {
    save_polaris_setting(&setting)?;

    // §11 レジストリ仕様: HKCU\...\Run に Polaris のみ登録
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {}", e))?;
    let base_dir = exe_dir.parent().ok_or("Failed to get exe dir")?;
    // インストール後パス: STELLARECORD/ の直下に Polaris.exe がある想定
    let polaris_exe = base_dir.join("app\\Polaris\\Polaris.exe");

    let reg_cmd = if setting.enableStartup {
        format!(
            "Reg Add 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' /v 'Polaris' /t REG_SZ /d '\"{}\"' /f",
            polaris_exe.to_string_lossy()
        )
    } else {
        "Reg Delete 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' /v 'Polaris' /f".to_string()
    };

    let _ = Command::new("powershell")
        .args(&["-Command", &reg_cmd])
        .output();

    Ok(())
}

#[tauri::command]
fn get_planetarium_config() -> PlanetariumSetting {
    load_planetarium_setting()
}

#[tauri::command]
fn save_planetarium_config(setting: PlanetariumSetting) -> Result<(), String> {
    save_planetarium_setting(&setting)
}

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
    Command::new(app_path).spawn()
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
fn get_polaris_logs() -> Result<Vec<String>, String> {
    let local = std::env::var("LOCALAPPDATA").map_err(|_| "LOCALAPPDATA not found")?;
    let log_path = std::path::Path::new(&local).join("CosmoArtsStore\\STELLARECORD\\app\\Polaris\\polaris_appinfo.log");
    
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

#[tauri::command]
fn launch_planetarium(handle: tauri::AppHandle, force_sync: bool) -> Result<String, String> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("Failed to get exe path: {}", e))?;
    let base_dir = exe_dir.parent().ok_or("Failed to get exe dir")?;
    let planetarium_exe = base_dir.join("app\\Planetarium\\Planetarium.exe");

    if !planetarium_exe.exists() {
        return Err("Planetarium.exe が見つかりません。".to_string());
    }

    let mut cmd = Command::new(planetarium_exe);
    if force_sync {
        cmd.arg("--force-sync");
    }
    cmd.stdout(std::process::Stdio::piped());

    match cmd.spawn() {
        Ok(mut child) => {
            let stdout = child.stdout.take().unwrap();
            std::thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines().flatten() {
                    // [PROGRESS] 15% のような形式をパースして emit
                    if line.contains("[PROGRESS]") {
                        let _ = handle.emit("planetarium-progress", line.clone());
                    }
                    if line.contains("[STATUS]") {
                        let _ = handle.emit("planetarium-status", line.clone());
                    }
                }
                let _ = child.wait();
                let _ = handle.emit("planetarium-finished", ());
            });
            Ok("Planetarium.exe を開始しました。".to_string())
        },
        Err(e) => Err(format!("Planetarium.exe の起動に失敗しました: {}", e))
    }
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

#[tauri::command]
fn read_launcher_json(section: &str) -> Vec<stella_record_ui::config::AppCard> {
    let filename = if section == "pleiades" { "PleiadesPath.json" } else { "JewelBoxPath.json" };
    stella_record_ui::config::load_launcher_json(filename)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_polaris_config,
            save_polaris_config,
            get_planetarium_config,
            save_planetarium_config,
            execute_manual_backup,
            launch_planetarium,
            cancel_planetarium,
            read_launcher_json,
            launch_external_app,
            get_polaris_status,
            get_polaris_logs,
        ])
        .setup(|app| {
            // §5.2 起動シーケンス: 非同期で Planetarium.exe を起動する
            // 実行パスから相対的に解決
            if let Ok(exe_dir) = std::env::current_exe() {
                if let Some(base_dir) = exe_dir.parent() {
                    let planetarium_exe = base_dir.join("app\\Planetarium\\Planetarium.exe");
                    if planetarium_exe.exists() {
                        let _ = Command::new(planetarium_exe).spawn();
                    }
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
