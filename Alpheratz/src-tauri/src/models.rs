use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PhotoRecord {
    pub photo_filename: String,
    pub photo_path: String,
    pub world_id: Option<String>,
    pub world_name: Option<String>,
    pub timestamp: String,
    #[serde(default)]
    pub memo: String,
    pub phash: Option<String>,
}

impl Default for PhotoRecord {
    fn default() -> Self {
        Self {
            photo_filename: String::new(),
            photo_path: String::new(),
            world_id: None,
            world_name: None,
            timestamp: String::new(),
            memo: String::new(),
            phash: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScanProgress {
    pub processed: usize,
    pub total: usize,
    pub current_world: String,
}
