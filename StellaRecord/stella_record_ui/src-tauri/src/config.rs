use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

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

/// 仕様書 §8.2 PlanetariumSetting.json
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlanetariumSetting {
    #[serde(default)]
    pub archivePath: String,
    #[serde(default)]
    pub dbPath: String,
    /// §6.6 Privacy/Tracking モード。false = Privacy（デフォルト）
    #[serde(default)]
    pub enableUserTracking: bool,
}

impl Default for PlanetariumSetting {
    fn default() -> Self {
        PlanetariumSetting {
            archivePath: String::new(),
            dbPath: String::new(),
            enableUserTracking: false,
        }
    }
}

fn get_setting_base() -> Result<PathBuf, String> {
    let local = std::env::var("LOCALAPPDATA").map_err(|_| "Failed to get LOCALAPPDATA")?;
    let dir = Path::new(&local).join("CosmoArtsStore\\STELLARECORD\\setting");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {}", e))?;
    }
    Ok(dir)
}

pub fn load_polaris_setting() -> PolarisSetting {
    if let Ok(base) = get_setting_base() {
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

pub fn load_planetarium_setting() -> PlanetariumSetting {
    if let Ok(base) = get_setting_base() {
        let path = base.join("PlanetariumSetting.json");
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                if let Ok(s) = serde_json::from_str::<PlanetariumSetting>(&content) {
                    return s;
                }
            }
        }
    }
    PlanetariumSetting::default()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppCard {
    pub name: String,
    pub description: String,
    pub path: String,
    pub icon_path: Option<String>,
}

pub fn load_launcher_json(filename: &str) -> Vec<AppCard> {
    if let Ok(base) = get_setting_base() {
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
    /// アーカイブ先ディレクトリ。正規パスは log_archive。
    pub fn get_effective_archive_dir(&self) -> Result<PathBuf, String> {
        let local = std::env::var("LOCALAPPDATA").map_err(|_| "Failed to get LOCALAPPDATA")?;
        let default = Path::new(&local).join("CosmoArtsStore\\STELLARECORD\\Polaris\\log_archive");

        if self.archivePath.is_empty() {
            Ok(default)
        } else {
            Ok(PathBuf::from(&self.archivePath))
        }
    }
}

impl PlanetariumSetting {
    /// アーカイブ先ディレクトリ。正規パスは log_archive。
    pub fn get_effective_archive_dir(&self) -> Result<PathBuf, String> {
        let local = std::env::var("LOCALAPPDATA").map_err(|_| "Failed to get LOCALAPPDATA")?;
        let default = Path::new(&local).join("CosmoArtsStore\\STELLARECORD\\Polaris\\log_archive");

        if self.archivePath.is_empty() {
            Ok(default)
        } else {
            Ok(PathBuf::from(&self.archivePath))
        }
    }

    pub fn get_effective_db_path(&self) -> Result<PathBuf, String> {
        if !self.dbPath.is_empty() {
            return Ok(PathBuf::from(&self.dbPath));
        }
        let local = std::env::var("LOCALAPPDATA").map_err(|_| "Failed to get LOCALAPPDATA")?;
        let db_dir = Path::new(&local).join("CosmoArtsStore\\STELLARECORD\\Planetarium");
        if !db_dir.exists() {
            fs::create_dir_all(&db_dir).map_err(|e| format!("Failed to create db dir: {}", e))?;
        }
        Ok(db_dir.join("planetarium.db"))
    }
}
