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

fn get_setting_base() -> Result<PathBuf, String> {
    let local = std::env::var("LOCALAPPDATA").map_err(|_| "Failed to get LOCALAPPDATA")?;
    let dir = Path::new(&local).join("CosmoArtsStore").join("stellarecord");
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

pub fn load_stellarecord_setting() -> StellaRecordSetting {
    if let Ok(base) = get_setting_base() {
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
        let default = Path::new(&local).join("CosmoArtsStore\\STELLARECORD\\Polaris\\archive");

        if self.archivePath.is_empty() {
            Ok(default)
        } else {
            Ok(PathBuf::from(&self.archivePath))
        }
    }
}

impl StellaRecordSetting {
    /// アーカイブ先ディレクトリ。
    pub fn get_effective_archive_dir(&self) -> Result<PathBuf, String> {
        let local = std::env::var("LOCALAPPDATA").map_err(|_| "Failed to get LOCALAPPDATA")?;
        let default = Path::new(&local).join("CosmoArtsStore").join("polaris").join("archive");

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
        // cosmos.jsonからDBパスを取得する
        let local = std::env::var("LOCALAPPDATA").map_err(|_| "Failed to get LOCALAPPDATA")?;
        let cosmos_path = Path::new(&local).join("CosmoArtsStore").join("cosmos.json");
        if cosmos_path.exists() {
            if let Ok(content) = fs::read_to_string(&cosmos_path) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(p) = val["stellarecord_db"].as_str() {
                        if !p.is_empty() { return Ok(PathBuf::from(p)); }
                    }
                }
            }
        }
        // デフォルトパス: %LOCALAPPDATA%\CosmoArtsStore\stellarecord\stellarecord.db
        let db_dir = Path::new(&local).join("CosmoArtsStore").join("stellarecord");
        if !db_dir.exists() {
            fs::create_dir_all(&db_dir).map_err(|e| format!("Failed to create db dir: {}", e))?;
        }
        Ok(db_dir.join("stellarecord.db"))
    }
}
