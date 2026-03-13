use chrono::Local;
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

const REGISTRY_BASE_KEY: &str = "Software\\CosmoArtsStore\\STELLAProject";

fn get_install_dir_by_component(component: &str) -> Option<PathBuf> {
    let key_path = format!("{}\\{}", REGISTRY_BASE_KEY, component);
    let key = match RegKey::predef(HKEY_CURRENT_USER).open_subkey(&key_path) {
        Ok(key) => key,
        Err(err) => {
            eprintln!(
                "[Alpheratz][WARN] registry open failed [{}]: {}",
                key_path, err
            );
            return None;
        }
    };
    let path: String = match key.get_value("InstallLocation") {
        Ok(path) => path,
        Err(err) => {
            eprintln!(
                "[Alpheratz][WARN] registry value read failed [{}\\InstallLocation]: {}",
                key_path, err
            );
            return None;
        }
    };
    Some(PathBuf::from(path))
}

pub fn get_alpheratz_install_dir() -> Option<PathBuf> {
    get_install_dir_by_component("Alpheratz")
}

pub fn get_stella_record_install_dir() -> Option<PathBuf> {
    for component in ["STELLA_RECORD", "StellaRecord"] {
        if let Some(path) = get_install_dir_by_component(component) {
            if path.exists() {
                return Some(path);
            }
        }
    }
    None
}

pub fn log_msg(level: &str, msg: &str) {
    if let Some(path) = get_alpheratz_install_dir().map(|p| p.join("info.log")) {
        match OpenOptions::new().create(true).append(true).open(&path) {
            Ok(mut f) => {
                let now = Local::now().format("%Y-%m-%d %H:%M:%S");
                if let Err(err) = writeln!(f, "[{}] [{}] {}", now, level, msg) {
                    eprintln!(
                        "[Alpheratz][WARN] log write failed [{}]: {}",
                        path.display(),
                        err
                    );
                }
            }
            Err(err) => {
                eprintln!(
                    "[Alpheratz][WARN] log open failed [{}]: {}",
                    path.display(),
                    err
                );
            }
        }
    }
}

pub fn log_warn(msg: &str) {
    log_msg("WARN", msg);
}
pub fn log_err(msg: &str) {
    log_msg("ERROR", msg);
}

pub fn get_thumbnail_cache_dir() -> Result<PathBuf, String> {
    let install_dir =
        get_alpheratz_install_dir().ok_or_else(|| "Failed to get install dir".to_string())?;
    let cache_dir = install_dir.join("cache");
    fs::create_dir_all(&cache_dir).map_err(|e| {
        format!(
            "Failed to create cache directory ({}): {}",
            cache_dir.display(),
            e
        )
    })?;
    Ok(cache_dir)
}

pub fn create_thumbnail_file(path: &str) -> Result<String, String> {
    let cache_dir = get_thumbnail_cache_dir()?;
    let path_p = Path::new(path);
    let filename = path_p
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Failed to resolve file name".to_string())?;
    let cache_path = cache_dir.join(format!("{}.thumb.jpg", filename));

    if cache_path.exists() {
        return Ok(cache_path.to_string_lossy().to_string());
    }

    let img = image::open(path).map_err(|e| e.to_string())?;
    let thumb = img.thumbnail(360, 360);
    thumb.save(&cache_path).map_err(|e| e.to_string())?;

    Ok(cache_path.to_string_lossy().to_string())
}
