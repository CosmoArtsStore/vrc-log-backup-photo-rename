use std::path::{Path, PathBuf};
use std::fs;
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;
use chrono::Local;
use std::fs::OpenOptions;
use std::io::Write;

fn get_alpheratz_install_dir() -> Option<PathBuf> {
    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\CosmoArtsStore\\STELLAProject\\Alpheratz").ok()?;
    let path: String = key.get_value("InstallLocation").ok()?;
    Some(PathBuf::from(path))
}

pub fn log_msg(level: &str, msg: &str) {
    if let Some(path) = get_alpheratz_install_dir().map(|p| p.join("info.log")) {
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
            let now = Local::now().format("%Y-%m-%d %H:%M:%S");
            let _ = writeln!(f, "[{}] [{}] {}", now, level, msg);
        }
    }
}

pub fn log_warn(msg: &str) { log_msg("WARN",  msg); }
pub fn log_err (msg: &str) { log_msg("ERROR", msg); }

pub fn get_thumbnail_cache_dir() -> Option<PathBuf> {
    let cache_dir = get_alpheratz_install_dir()?.join("cache");
    let _ = fs::create_dir_all(&cache_dir);
    Some(cache_dir)
}

pub fn create_thumbnail_file(path: &str) -> Result<String, String> {
    let cache_dir = get_thumbnail_cache_dir().ok_or_else(|| {
        log_err("Failed to get cache dir");
        "Failed to get cache dir".to_string()
    })?;
    let path_p = Path::new(path);
    let filename = path_p.file_name().and_then(|n| n.to_str()).unwrap_or("tmp.png");
    let cache_path = cache_dir.join(format!("{}.thumb.jpg", filename));

    if cache_path.exists() {
        return Ok(cache_path.to_string_lossy().to_string());
    }

    let img = image::open(path).map_err(|e| e.to_string())?;
    let thumb = img.thumbnail(360, 360); 
    thumb.save(&cache_path).map_err(|e| e.to_string())?;

    Ok(cache_path.to_string_lossy().to_string())
}
