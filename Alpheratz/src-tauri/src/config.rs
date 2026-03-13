use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

fn get_alpheratz_install_dir() -> Option<PathBuf> {
    let root = RegKey::predef(HKEY_CURRENT_USER);
    let key = root
        .open_subkey("Software\\CosmoArtsStore\\STELLAProject\\Alpheratz").ok()?;
    let path: String = key.get_value("InstallLocation").ok()?;
    let path_buf = PathBuf::from(path);
    if path_buf.exists() {
        Some(path_buf)
    } else {
        None
    }
}

/// 仕様書 §8.4 AlpheratzSetting.json
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AlpheratzSetting {
    #[serde(default, rename = "photoFolderPath")]
    pub photo_folder_path: String,
}

impl Default for AlpheratzSetting {
    fn default() -> Self {
        AlpheratzSetting {
            photo_folder_path: String::new(),
        }
    }
}

fn get_setting_path() -> Option<PathBuf> {
    Some(get_alpheratz_install_dir()?.join("alpheratz.json"))
}

pub fn load_setting() -> AlpheratzSetting {
    if let Some(path) = get_setting_path() {
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(s) = serde_json::from_str::<AlpheratzSetting>(&content) {
                    return s;
                }
            }
        }
    }
    AlpheratzSetting::default()
}

pub fn save_setting(s: &AlpheratzSetting) -> Result<(), String> {
    let path = get_setting_path().ok_or_else(|| "Failed to get setting path".to_string())?;
    let content = serde_json::to_string_pretty(s)
        .map_err(|e| format!("Serialize error: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("Write error ({}): {}", path.display(), e))?;
    Ok(())
}
