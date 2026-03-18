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
    pub orientation: Option<String>,
    pub image_width: Option<i64>,
    pub image_height: Option<i64>,
    #[serde(default)]
    pub source_slot: i64,
    #[serde(default)]
    pub is_favorite: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    pub match_source: Option<String>,
    #[serde(default)]
    pub is_missing: bool,
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
            orientation: None,
            image_width: None,
            image_height: None,
            source_slot: 1,
            is_favorite: false,
            tags: Vec::new(),
            match_source: None,
            is_missing: false,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScanProgress {
    pub processed: usize,
    pub total: usize,
    pub current_world: String,
    pub phase: String,
}
