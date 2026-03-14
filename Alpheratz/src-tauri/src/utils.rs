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

pub fn log_msg(level: &str, msg: &str) {
    if let Some(path) = get_alpheratz_install_dir().map(|p| p.join("info.log")) {
        match OpenOptions::new().create(true).append(true).open(&path) {
            Ok(mut f) => {
                let now = Local::now().format("%Y-%m-%d %H:%M:%S");
                if let Err(err) = writeln!(f, "[{}] [{}] {}", now, level, msg) {
                    // Intentional: fallback to stderr to avoid recursive log errors.
                    eprintln!(
                        "[Alpheratz][WARN] log write failed [{}]: {}",
                        path.display(),
                        err
                    );
                }
            }
            Err(err) => {
                // Intentional: fallback to stderr to avoid recursive log errors.
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

    let img = image::open(path)
        .map_err(|e| format!("Failed to open image for thumbnail ({}): {}", path, e))?;
    let thumb = img.thumbnail(360, 360);
    thumb
        .save(&cache_path)
        .map_err(|e| format!("Failed to save thumbnail ({}): {}", cache_path.display(), e))?;

    Ok(cache_path.to_string_lossy().to_string())
}

pub fn set_startup_enabled(value_name: &str, enabled: bool) -> Result<(), String> {
    let run_key = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
        .map_err(|err| format!("Failed to open Run registry key: {}", err))?
        .0;

    if enabled {
        let executable = std::env::current_exe()
            .map_err(|err| format!("Failed to resolve current executable path: {}", err))?;
        let command = format!("\"{}\"", executable.display());
        run_key
            .set_value(value_name, &command)
            .map_err(|err| format!("Failed to register startup entry: {}", err))?;
    } else if let Err(err) = run_key.delete_value(value_name) {
        if err.kind() != std::io::ErrorKind::NotFound {
            return Err(format!("Failed to remove startup entry: {}", err));
        }
    }

    Ok(())
}
