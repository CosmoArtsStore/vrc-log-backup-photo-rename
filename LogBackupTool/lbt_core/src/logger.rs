use chrono::Local;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};

pub fn get_log_path() -> Result<PathBuf, String> {
    let home_dir = std::env::var("USERPROFILE").map_err(|_| "Failed to get USERPROFILE")?;
    let log_dir = Path::new(&home_dir).join("AppData\\Local\\CosmoArtsStore\\LogBackupTool\\Backend");
    if !log_dir.exists() {
        std::fs::create_dir_all(&log_dir).map_err(|e| format!("Failed to create log dir: {}", e))?;
    }
    Ok(log_dir.join("appinfo.log"))
}

pub fn truncate_log() {
    if let Ok(path) = get_log_path() {
        let _ = OpenOptions::new().write(true).truncate(true).create(true).open(path);
    }
}

pub fn log_info(module: &str, message: &str) {
    if let Ok(path) = get_log_path() {
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
            let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S");
            let _ = writeln!(file, "[{}] [{}] {}", timestamp, module, message);
        }
    }
}
