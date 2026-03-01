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
}

impl Default for PlanetariumSetting {
    fn default() -> Self {
        PlanetariumSetting {
            archivePath: String::new(),
            dbPath: String::new(),
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
    // 固定パス仕様のため、設定ファイルが存在しなくてもデフォルト値を返す
    PolarisSetting::default()
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
    pub fn get_effective_archive_dir(&self) -> Result<PathBuf, String> {
        let local = std::env::var("LOCALAPPDATA").map_err(|_| "Failed to get LOCALAPPDATA")?;
        Ok(Path::new(&local).join("CosmoArtsStore\\STELLARECORD\\app\\Polaris\\archive"))
    }
}
