use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

fn get_polaris_install_dir() -> Option<PathBuf> {
    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\CosmoArtsStore\\STELLAProject\\Polaris").ok()?;
    let path: String = key.get_value("InstallLocation").ok()?;
    Some(PathBuf::from(path))
}

fn get_stellarecord_install_dir() -> Option<PathBuf> {
    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\CosmoArtsStore\\STELLAProject\\StellaRecord").ok()?;
    let path: String = key.get_value("InstallLocation").ok()?;
    Some(PathBuf::from(path))
}

/// 仕様書 §8.1 PolarisSetting.json
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PolarisSetting {
    #[serde(default)]
    pub archivePath: String,
    #[serde(default = "default_capacity")]
    pub capacityThresholdBytes: u64,
    #[serde(default = "default_true")]
    pub enableStartup: bool,
    #[serde(default = "default_done")]
    pub migrationStatus: String,
    #[serde(default)]
    pub migrationSourcePath: String,
}

fn default_capacity() -> u64 { 10_737_418_240 }
fn default_true() -> bool { true }
fn default_done() -> String { "done".to_string() }

impl Default for PolarisSetting {
    fn default() -> Self {
        PolarisSetting {
            archivePath: String::new(),
            capacityThresholdBytes: default_capacity(),
            enableStartup: true,
            migrationStatus: "done".to_string(),
            migrationSourcePath: String::new(),
        }
    }
}

/// StellaRecord設定 (DBパス・アーカイブパス)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StellaRecordSetting {
    #[serde(default)]
    pub archivePath: String,
    #[serde(default)]
    pub dbPath: String,
}

impl Default for StellaRecordSetting {
    fn default() -> Self {
        StellaRecordSetting {
            archivePath: String::new(),
            dbPath: String::new(),
        }
    }
}

fn get_setting_base() -> Option<PathBuf> {
    get_stellarecord_install_dir()
}

pub fn load_polaris_setting() -> PolarisSetting {
    if let Some(base) = get_setting_base() {
        let path = base.join("PolarisSetting.json");
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(s) = serde_json::from_str::<PolarisSetting>(&content) {
                    return s;
                }
            }
        }
    }
    PolarisSetting::default()
}

pub fn load_stellarecord_setting() -> StellaRecordSetting {
    if let Some(base) = get_setting_base() {
        let path = base.join("StellaRecordSetting.json");
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(s) = serde_json::from_str::<StellaRecordSetting>(&content) {
                    return s;
                }
            }
        }
    }
    StellaRecordSetting::default()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppCard {
    pub name: String,
    pub description: String,
    pub path: String,
    pub icon_path: Option<String>,
}

pub fn load_launcher_json(filename: &str) -> Vec<AppCard> {
    if let Some(base) = get_setting_base() {
        let path = base.join(filename);
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(apps) = serde_json::from_str::<Vec<AppCard>>(&content) {
                    return apps;
                }
            }
        }
    }
    Vec::new()
}

impl PolarisSetting {
    /// アーカイブ先ディレクトリ。
    pub fn get_effective_archive_dir(&self) -> Option<PathBuf> {
        if !self.archivePath.is_empty() {
            return Some(PathBuf::from(&self.archivePath));
        }
        Some(get_polaris_install_dir()?.join("archive"))
    }
}

impl StellaRecordSetting {
    /// アーカイブ先ディレクトリ。
    pub fn get_effective_archive_dir(&self) -> Option<PathBuf> {
        if !self.archivePath.is_empty() {
            return Some(PathBuf::from(&self.archivePath));
        }
        Some(get_polaris_install_dir()?.join("archive"))
    }

    pub fn get_effective_db_path(&self) -> Option<PathBuf> {
        if !self.dbPath.is_empty() {
            return Some(PathBuf::from(&self.dbPath));
        }
        Some(get_stellarecord_install_dir()?.join("stellarecord.db"))
    }
}
