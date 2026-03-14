use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct AnalyzePayload {
    pub status: String,
    pub progress: String,
    pub is_running: bool,
}

#[derive(Debug, Serialize)]
pub struct TableData {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
}
