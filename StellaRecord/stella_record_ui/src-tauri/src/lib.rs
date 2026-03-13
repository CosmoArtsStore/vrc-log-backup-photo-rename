pub mod config;
pub mod analyze;

use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;
use chrono::Local;

fn get_stellarecord_install_dir() -> Option<PathBuf> {
    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\CosmoArtsStore\\STELLAProject\\StellaRecord").ok()?;
    let path: String = key.get_value("InstallLocation").ok()?;
    Some(PathBuf::from(path))
}

fn log_msg(level: &str, msg: &str) {
    if let Some(path) = get_stellarecord_install_dir().map(|p| p.join("info.log")) {
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
            let now = Local::now().format("%Y-%m-%d %H:%M:%S");
            let _ = writeln!(f, "[{}] [{}] {}", now, level, msg);
        }
    }
}

pub fn log_warn(msg: &str) { log_msg("WARN",  msg); }
pub fn log_err_lib (msg: &str) { log_msg("ERROR", msg); }

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!());

    if let Err(err) = app {
        log_err_lib(&format!("error while running tauri application: {}", err));
    }
}
