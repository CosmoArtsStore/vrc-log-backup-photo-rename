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

#[derive(Debug, Clone, Serialize)]
pub struct LogViewerLine {
    pub timestamp: String,
    pub level: String,
    pub category: String,
    pub raw_line: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LogViewerData {
    pub archive_name: String,
    pub source_name: String,
    pub lines: Vec<LogViewerLine>,
}
