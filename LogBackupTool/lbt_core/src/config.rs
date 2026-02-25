use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Preferences {
    pub backupDestinationPath: String,
    pub capacityThresholdBytes: u64,
    pub enableStartup: bool,
}

impl Default for Preferences {
    fn default() -> Self {
        Preferences {
            backupDestinationPath: "".to_string(),
            capacityThresholdBytes: 10_737_418_240, // 10 GB
            enableStartup: true,
        }
    }
}

pub fn get_pref_path() -> Result<PathBuf, String> {
    let home_dir = std::env::var("USERPROFILE").map_err(|_| "Failed to get USERPROFILE")?;
    let pref_dir = Path::new(&home_dir).join("AppData\\Local\\CosmoArtsStore\\LogBackupTool\\Backend");
    if !pref_dir.exists() {
        fs::create_dir_all(&pref_dir).map_err(|e| format!("Failed to create pref dir: {}", e))?;
    }
    Ok(pref_dir.join("Config.json"))
}

pub fn load_preferences() -> Preferences {
    if let Ok(path) = get_pref_path() {
        if path.exists() {
            if let Ok(content) = fs::read_to_string(path) {
                if let Ok(prefs) = serde_json::from_str::<Preferences>(&content) {
                    return prefs;
                }
            }
        }
    }
    Preferences::default()
}

pub fn save_preferences(prefs: &Preferences) -> Result<(), String> {
    let path = get_pref_path()?;
    let content = serde_json::to_string_pretty(prefs).map_err(|e| format!("JSON serialize err: {}", e))?;
    fs::write(path, content).map_err(|e| format!("File write err: {}", e))?;
    Ok(())
}

impl Preferences {
    pub fn get_effective_target_dir(&self) -> Result<PathBuf, String> {
        if !self.backupDestinationPath.is_empty() {
            return Ok(PathBuf::from(&self.backupDestinationPath));
        }
        let home_dir = std::env::var("USERPROFILE").map_err(|_| "Failed to get USERPROFILE")?;
        Ok(Path::new(&home_dir).join("AppData\\Local\\CosmoArtsStore\\LogBackupTool\\BackupFile"))
    }
}
