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

fn default_capacity() -> u64 { 10_737_418_240 } // 10 GB
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

/// %LOCALAPPDATA%\CosmoArtsStore\STELLARECORD\setting\PolarisSetting.json
pub fn get_setting_path() -> Result<PathBuf, String> {
    let local = std::env::var("LOCALAPPDATA").map_err(|_| "Failed to get LOCALAPPDATA")?;
    let dir = Path::new(&local).join("CosmoArtsStore\\STELLARECORD\\setting");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("Failed to create setting dir: {}", e))?;
    }
    Ok(dir.join("PolarisSetting.json"))
}

pub fn load_setting() -> PolarisSetting {
    if let Ok(path) = get_setting_path() {
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

pub fn save_setting(s: &PolarisSetting) -> Result<(), String> {
    let path = get_setting_path()?;
    let content = serde_json::to_string_pretty(s)
        .map_err(|e| format!("JSON serialize error: {}", e))?;
    fs::write(path, content).map_err(|e| format!("File write error: {}", e))?;
    Ok(())
}

impl PolarisSetting {
    /// archivePath が空の場合のデフォルトパス
    pub fn get_effective_archive_dir(&self) -> Result<PathBuf, String> {
        if !self.archivePath.is_empty() {
            return Ok(PathBuf::from(&self.archivePath));
        }
        let local = std::env::var("LOCALAPPDATA").map_err(|_| "Failed to get LOCALAPPDATA")?;
        Ok(Path::new(&local).join("CosmoArtsStore\\STELLARECORD\\app\\Polaris\\archive"))
    }
}
