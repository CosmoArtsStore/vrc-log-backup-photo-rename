use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::utils;

fn read_json_file<T>(path: &PathBuf) -> Option<T>
where
    T: for<'de> Deserialize<'de>,
{
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(err) => {
            utils::log_warn(&format!(
                "setting read failed [{}]: {}",
                path.display(),
                err
            ));
            return None;
        }
    };

    match serde_json::from_str::<T>(&content) {
        Ok(value) => Some(value),
        Err(err) => {
            utils::log_warn(&format!(
                "setting parse failed [{}]: {}",
                path.display(),
                err
            ));
            None
        }
    }
}

fn get_setting_base() -> Option<PathBuf> {
    utils::get_stellarecord_install_dir()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PolarisSetting {
    #[serde(default, rename = "archivePath", alias = "archive_path")]
    pub archive_path: String,
    #[serde(
        default = "default_capacity",
        rename = "capacityThresholdBytes",
        alias = "capacity_threshold_bytes"
    )]
    pub capacity_threshold_bytes: u64,
    #[serde(
        default = "default_true",
        rename = "enableStartup",
        alias = "enable_startup"
    )]
    pub enable_startup: bool,
    #[serde(
        default = "default_done",
        rename = "migrationStatus",
        alias = "migration_status"
    )]
    pub migration_status: String,
    #[serde(
        default,
        rename = "migrationSourcePath",
        alias = "migration_source_path"
    )]
    pub migration_source_path: String,
}

fn default_capacity() -> u64 {
    1_048_576_000
}

fn default_true() -> bool {
    true
}

fn default_done() -> String {
    "done".to_string()
}

impl Default for PolarisSetting {
    fn default() -> Self {
        Self {
            archive_path: String::new(),
            capacity_threshold_bytes: default_capacity(),
            enable_startup: true,
            migration_status: default_done(),
            migration_source_path: String::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct StellaRecordSetting {
    #[serde(default, rename = "archivePath", alias = "archive_path")]
    pub archive_path: String,
    #[serde(default, rename = "dbPath", alias = "db_path")]
    pub db_path: String,
    #[serde(default, rename = "enableStartup", alias = "enable_startup")]
    pub enable_startup: bool,
    #[serde(
        default,
        rename = "startupPreferenceSet",
        alias = "startup_preference_set"
    )]
    pub startup_preference_set: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppCard {
    pub name: String,
    pub description: String,
    pub path: String,
    pub icon_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct RegistryCatalog {
    #[serde(default)]
    pub fastparty: Vec<AppCard>,
    #[serde(default)]
    pub thirdparty: Vec<AppCard>,
}

pub fn load_polaris_setting() -> PolarisSetting {
    let Some(base) = get_setting_base() else {
        utils::log_warn(
            "StellaRecord install directory not found while loading PolarisSetting.json",
        );
        return PolarisSetting::default();
    };

    let path = base.join("PolarisSetting.json");
    if !path.exists() {
        return PolarisSetting::default();
    }

    read_json_file(&path).unwrap_or_default()
}

pub fn save_polaris_setting(setting: &PolarisSetting) -> Result<(), String> {
    let Some(base) = get_setting_base() else {
        return Err(
            "StellaRecord install directory not found while saving PolarisSetting.json".to_string(),
        );
    };

    let path = base.join("PolarisSetting.json");
    let content = serde_json::to_string_pretty(setting)
        .map_err(|err| format!("Failed to serialize PolarisSetting.json: {}", err))?;
    fs::write(&path, content).map_err(|err| format!("Failed to write {}: {}", path.display(), err))
}

pub fn load_stellarecord_setting() -> StellaRecordSetting {
    let Some(base) = get_setting_base() else {
        utils::log_warn(
            "StellaRecord install directory not found while loading StellaRecordSetting.json",
        );
        return StellaRecordSetting::default();
    };

    let path = base.join("StellaRecordSetting.json");
    if !path.exists() {
        return StellaRecordSetting::default();
    }

    read_json_file(&path).unwrap_or_default()
}

pub fn save_stellarecord_setting(setting: &StellaRecordSetting) -> Result<(), String> {
    let Some(base) = get_setting_base() else {
        return Err(
            "StellaRecord install directory not found while saving StellaRecordSetting.json"
                .to_string(),
        );
    };

    let path = base.join("StellaRecordSetting.json");
    let content = serde_json::to_string_pretty(setting)
        .map_err(|err| format!("Failed to serialize StellaRecordSetting.json: {}", err))?;
    fs::write(&path, content).map_err(|err| format!("Failed to write {}: {}", path.display(), err))
}

pub fn load_launcher_json(filename: &str) -> Vec<AppCard> {
    let Some(base) = get_setting_base() else {
        utils::log_warn(&format!(
            "StellaRecord install directory not found while loading launcher json [{}]",
            filename
        ));
        return Vec::new();
    };

    let path = base.join(filename);
    if !path.exists() {
        return Vec::new();
    }

    read_json_file(&path).unwrap_or_default()
}

pub fn load_registry_catalog() -> RegistryCatalog {
    let Some(base) = get_setting_base() else {
        utils::log_warn("StellaRecord install directory not found while loading registry.json");
        return RegistryCatalog::default();
    };

    let registry_path = base.join("registry.json");
    if registry_path.exists() {
        return read_json_file(&registry_path).unwrap_or_default();
    }

    RegistryCatalog {
        fastparty: load_launcher_json("pleiades.json"),
        thirdparty: load_launcher_json("jewelbox.json"),
    }
}

impl PolarisSetting {
    pub fn get_effective_archive_dir(&self) -> Option<PathBuf> {
        if !self.archive_path.is_empty() {
            return Some(PathBuf::from(&self.archive_path));
        }
        Some(utils::get_polaris_install_dir()?.join("archive"))
    }
}

impl StellaRecordSetting {
    pub fn get_effective_archive_dir(&self) -> Option<PathBuf> {
        if !self.archive_path.is_empty() {
            return Some(PathBuf::from(&self.archive_path));
        }
        Some(utils::get_polaris_install_dir()?.join("archive"))
    }

    pub fn get_effective_db_path(&self) -> Option<PathBuf> {
        if !self.db_path.is_empty() {
            return Some(PathBuf::from(&self.db_path));
        }
        Some(utils::get_stellarecord_install_dir()?.join("stellarecord.db"))
    }
}
