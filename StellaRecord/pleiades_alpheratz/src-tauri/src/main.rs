#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use alpheratz_lib::config::{load_setting, save_setting, AlpheratzSetting};

/// 仕様書 §7: 写真とワールド情報を照合・表示・メモ管理する独立アプリケーション
/// ファイルリネーム機能は持たない（設計原則 No.6 遵守）

#[tauri::command]
fn get_setting() -> AlpheratzSetting {
    load_setting()
}

#[tauri::command]
fn save_setting_cmd(setting: AlpheratzSetting) -> Result<(), String> {
    save_setting(&setting)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_setting,
            save_setting_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
