use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PhotoRecord {
    pub photo_filename: String,
    pub photo_path: String,
    pub world_id: Option<String>,
    pub world_name: Option<String>,
    pub timestamp: String,
    pub memo: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScanProgress {
    pub processed: usize,
    pub total: usize,
    pub current_world: String,
}
