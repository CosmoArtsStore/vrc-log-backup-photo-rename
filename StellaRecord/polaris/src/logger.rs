use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};

/// %LOCALAPPDATA%\CosmoArtsStore\STELLARECORD\app\Polaris\polaris_appinfo.log
pub fn get_log_path() -> Result<PathBuf, String> {
    let local = std::env::var("LOCALAPPDATA").map_err(|_| "Failed to get LOCALAPPDATA")?;
    let log_dir = Path::new(&local).join("CosmoArtsStore\\STELLARECORD\\app\\Polaris");
    if !log_dir.exists() {
        std::fs::create_dir_all(&log_dir)
            .map_err(|e| format!("Failed to create log dir: {}", e))?;
    }
    Ok(log_dir.join("polaris_appinfo.log"))
}

/// 起動時にログファイルを Truncate（上書き）モードで初期化する
pub fn truncate_log() {
    if let Ok(path) = get_log_path() {
        let _ = OpenOptions::new().write(true).truncate(true).create(true).open(path);
    }
}

/// [YYYY-MM-DD HH:MM:SS] <メッセージ> 形式でログを追記する
pub fn log_info(module: &str, message: &str) {
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    let line = format!("[{}] [{}] {}\n", now, module, message);
    if let Ok(path) = get_log_path() {
        let _ = OpenOptions::new().append(true).create(true).open(path)
            .and_then(|mut f| f.write_all(line.as_bytes()));
    }
}
