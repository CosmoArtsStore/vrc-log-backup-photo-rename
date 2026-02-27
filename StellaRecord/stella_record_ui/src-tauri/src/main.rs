#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Command;
use sysinfo::{System, ProcessesToUpdate};
use stella_record_ui::config::{
    load_polaris_setting, save_polaris_setting, PolarisSetting,
    load_planetarium_setting, save_planetarium_setting, PlanetariumSetting,
};
use tauri::Manager;
use std::path::PathBuf;
use std::fs;

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
fn launch_planetarium(force_sync: bool) -> Result<String, String> {
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

    // 非同期な子プロセスとして起動（フロントは完了を待たない想定だが、ポーリングやToastのために
    // 本来はTauriのEvent等を使うのがベスト。ここではプロセス起動後にすぐ返す）
    match cmd.spawn() {
        Ok(_) => Ok("Planetarium.exe をバックグラウンドで起動しました。".to_string()),
        Err(e) => Err(format!("Planetarium.exe の起動に失敗しました: {}", e))
    }
}

/// §5.8 Pleiades / JewelBox カード情報の登録仕様
#[tauri::command]
fn read_launcher_json(filename: &str) -> Result<String, String> {
    let localappdata = std::env::var("LOCALAPPDATA").map_err(|_| "LOCALAPPDATA not found")?;
    let path = PathBuf::from(localappdata)
        .join("CosmoArtsStore")
        .join("STELLARECORD")
        .join("setting")
        .join(filename);

    if !path.exists() {
        return Ok("[]".to_string());
    }

    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn launch_external_app(app_path: &str) -> Result<(), String> {
    Command::new(app_path).spawn()
        .map_err(|e| format!("起動に失敗しました: {}", e))?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_polaris_config,
            save_polaris_config,
            get_planetarium_config,
            save_planetarium_config,
            execute_manual_backup,
            launch_planetarium,
            read_launcher_json,
            launch_external_app,
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
