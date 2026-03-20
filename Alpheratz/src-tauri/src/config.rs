use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::utils;

/// 仕様書 §8.4 AlpheratzSetting.json
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AlpheratzSetting {
    #[serde(default, rename = "photoFolderPath")]
    pub photo_folder_path: String,
    #[serde(
        default,
        rename = "secondaryPhotoFolderPath",
        alias = "secondary_photo_folder_path"
    )]
    pub secondary_photo_folder_path: String,
    #[serde(default, rename = "themeMode", alias = "theme_mode")]
    pub theme_mode: String,
    #[serde(default, rename = "viewMode", alias = "view_mode")]
    pub view_mode: String,
    #[serde(default, rename = "enableStartup", alias = "enable_startup")]
    pub enable_startup: bool,
    #[serde(
        default,
        rename = "startupPreferenceSet",
        alias = "startup_preference_set"
    )]
    pub startup_preference_set: bool,
    #[serde(default, rename = "tweetTemplates", alias = "tweet_templates")]
    pub tweet_templates: Vec<String>,
    #[serde(
        default,
        rename = "activeTweetTemplate",
        alias = "active_tweet_template"
    )]
    pub active_tweet_template: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BackupPathEntry {
    #[serde(rename = "photoFolderPath")]
    pub photo_folder_path: String,
    #[serde(rename = "backupFolderName")]
    pub backup_folder_name: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

impl Default for AlpheratzSetting {
    fn default() -> Self {
        let tweet_templates = vec![
            "おは{world-name}\n\n#{タグを追加}".to_string(),
            "World: {world-name}\nAuthor:\n\n#VRChat_world紹介".to_string(),
            "World: {world-name}\nAuthor:\nCloth:\n\n#VRChatPhotography".to_string(),
        ];
        let active_tweet_template = tweet_templates[0].clone();
        AlpheratzSetting {
            photo_folder_path: String::new(),
            secondary_photo_folder_path: String::new(),
            theme_mode: "light".to_string(),
            view_mode: "standard".to_string(),
            enable_startup: false,
            startup_preference_set: false,
            tweet_templates,
            active_tweet_template,
        }
    }
}

fn get_setting_path() -> Option<PathBuf> {
    Some(utils::get_alpheratz_setting_dir()?.join("setting.json"))
}

fn get_backup_path_path() -> Option<PathBuf> {
    Some(utils::get_alpheratz_setting_dir()?.join("backupPath.json"))
}

fn get_legacy_setting_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Some(install_dir) = utils::get_alpheratz_install_dir() {
        paths.push(install_dir.join("alpheratz.json"));
        paths.push(install_dir.join("Alpheratz.json"));
    }
    if let Some(cache_dir) = utils::get_alpheratz_cache_dir() {
        paths.push(cache_dir.join("cachePath.json"));
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
                        if let Err(err) = save_setting(&setting) {
                            utils::log_warn(&format!(
                                "Failed to migrate legacy settings ({}): {}",
                                legacy_path.display(),
                                err
                            ));
                        }
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

pub fn load_backup_paths() -> Vec<BackupPathEntry> {
    let Some(path) = get_backup_path_path() else {
        return Vec::new();
    };

    if !path.exists() {
        return Vec::new();
    }

    match fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str::<Vec<BackupPathEntry>>(&content) {
            Ok(entries) => entries,
            Err(err) => {
                utils::log_warn(&format!(
                    "Failed to parse backup path JSON ({}): {}",
                    path.display(),
                    err
                ));
                Vec::new()
            }
        },
        Err(err) => {
            utils::log_warn(&format!(
                "Failed to read backup path file ({}): {}",
                path.display(),
                err
            ));
            Vec::new()
        }
    }
}

pub fn save_backup_paths(entries: &[BackupPathEntry]) -> Result<(), String> {
    let path = get_backup_path_path()
        .ok_or_else(|| "バックアップ管理ファイルの保存先を取得できません".to_string())?;
    let content = serde_json::to_string_pretty(entries)
        .map_err(|err| format!("バックアップ管理情報を JSON に変換できません: {}", err))?;
    fs::write(&path, content).map_err(|err| {
        format!(
            "バックアップ管理ファイルを書き込めません ({}): {}",
            path.display(),
            err
        )
    })?;
    Ok(())
}
