use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

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

/// %LOCALAPPDATA%\CosmoArtsStore\STELLARECORD\setting\PlanetariumSetting.json
pub fn get_setting_path() -> Result<PathBuf, String> {
    let local = std::env::var("LOCALAPPDATA").map_err(|_| "Failed to get LOCALAPPDATA")?;
    let dir = Path::new(&local).join("CosmoArtsStore\\STELLARECORD\\setting");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dir: {}", e))?;
    }
    Ok(dir.join("PlanetariumSetting.json"))
}

pub fn load_setting() -> PlanetariumSetting {
    if let Ok(path) = get_setting_path() {
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

impl PlanetariumSetting {
    pub fn get_effective_archive_dir(&self) -> Result<PathBuf, String> {
        if !self.archivePath.is_empty() {
            return Ok(PathBuf::from(&self.archivePath));
        }
        let local = std::env::var("LOCALAPPDATA").map_err(|_| "Failed to get LOCALAPPDATA")?;
        Ok(Path::new(&local).join("CosmoArtsStore\\STELLARECORD\\app\\Polaris\\archive"))
    }

    pub fn get_effective_db_path(&self) -> Result<PathBuf, String> {
        if !self.dbPath.is_empty() {
            return Ok(PathBuf::from(&self.dbPath));
        }
        let local = std::env::var("LOCALAPPDATA").map_err(|_| "Failed to get LOCALAPPDATA")?;
        let db_dir = Path::new(&local).join("CosmoArtsStore\\STELLARECORD\\app\\Planetarium");
        if !db_dir.exists() {
            fs::create_dir_all(&db_dir).map_err(|e| format!("Failed to create db dir: {}", e))?;
        }
        Ok(db_dir.join("planetarium.db"))
    }
}
