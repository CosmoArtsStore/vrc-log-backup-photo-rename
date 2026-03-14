use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::utils;

/// 仕様書 §8.4 AlpheratzSetting.json
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AlpheratzSetting {
    #[serde(default, rename = "photoFolderPath")]
    pub photo_folder_path: String,
    #[serde(default, rename = "themeMode", alias = "theme_mode")]
    pub theme_mode: String,
    #[serde(default, rename = "enableStartup", alias = "enable_startup")]
    pub enable_startup: bool,
    #[serde(
        default,
        rename = "startupPreferenceSet",
        alias = "startup_preference_set"
    )]
    pub startup_preference_set: bool,
}

impl Default for AlpheratzSetting {
    fn default() -> Self {
        AlpheratzSetting {
            photo_folder_path: String::new(),
            theme_mode: "light".to_string(),
            enable_startup: false,
            startup_preference_set: false,
        }
    }
}

fn get_setting_path() -> Option<PathBuf> {
    Some(utils::get_alpheratz_setting_dir()?.join("Alpheratz.json"))
}

fn get_legacy_setting_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(install_dir) = utils::get_alpheratz_install_dir() {
        paths.push(install_dir.join("alpheratz.json"));
        paths.push(install_dir.join("Alpheratz.json"));
    }
    paths
}

pub fn load_setting() -> AlpheratzSetting {
    if let Some(path) = get_setting_path() {
        if path.exists() {
            match fs::read_to_string(&path) {
                Ok(content) => match serde_json::from_str::<AlpheratzSetting>(&content) {
                    Ok(s) => return s,
                    Err(err) => {
                        utils::log_warn(&format!(
                            "Failed to parse settings JSON ({}): {}",
                            path.display(),
                            err
                        ));
                    }
                },
                Err(err) => {
                    utils::log_warn(&format!(
                        "Failed to read settings file ({}): {}",
                        path.display(),
                        err
                    ));
                }
            }
        }

        for legacy_path in get_legacy_setting_paths() {
            if !legacy_path.exists() {
                continue;
            }

            match fs::read_to_string(&legacy_path) {
                Ok(content) => match serde_json::from_str::<AlpheratzSetting>(&content) {
                    Ok(setting) => {
                        let _ = save_setting(&setting);
                        return setting;
                    }
                    Err(err) => utils::log_warn(&format!(
                        "Failed to parse legacy settings JSON ({}): {}",
                        legacy_path.display(),
                        err
                    )),
                },
                Err(err) => utils::log_warn(&format!(
                    "Failed to read legacy settings file ({}): {}",
                    legacy_path.display(),
                    err
                )),
            }
        }
    }
    AlpheratzSetting::default()
}

pub fn save_setting(s: &AlpheratzSetting) -> Result<(), String> {
    let path =
        get_setting_path().ok_or_else(|| "設定ファイルの保存先を取得できません".to_string())?;
    let content = serde_json::to_string_pretty(s)
        .map_err(|e| format!("設定を JSON に変換できません: {}", e))?;
    fs::write(&path, content)
        .map_err(|e| format!("設定ファイルを書き込めません ({}): {}", path.display(), e))?;
    Ok(())
}
