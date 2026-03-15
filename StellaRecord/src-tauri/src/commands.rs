use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};

use chrono::NaiveDateTime;
use serde::Serialize;
use tauri::AppHandle;

use crate::analyze;
use crate::config::{self, RegistryCatalog};
use crate::models::{AnalyzePayload, LogViewerData, LogViewerLine, TableData};
use crate::{platform, utils};

const STELLA_RECORD_RUN_VALUE: &str = "StellaRecord";
const HUNDRED_MB_BYTES: u64 = 100 * 1024 * 1024;

#[derive(Serialize)]
pub struct ManagementSettings {
    pub startup_enabled: bool,
    pub startup_preference_set: bool,
    pub archive_limit_mb: u64,
}

fn emit_analyze_progress(app: &AppHandle, status: String, progress: String, is_running: bool) {
    utils::emit_event_warn(
        app,
        "analyze-progress",
        AnalyzePayload {
            status,
            progress,
            is_running,
        },
    );
}

fn get_archive_dir() -> Result<PathBuf, String> {
    let setting = config::load_polaris_setting();
    setting
        .get_effective_archive_dir()
        .ok_or_else(|| "アーカイブディレクトリが見つかりません。".to_string())
}

fn get_db_path() -> Result<PathBuf, String> {
    let setting = config::load_stellarecord_setting();
    setting
        .get_effective_db_path()
        .ok_or_else(|| "データベースパスが見つかりません。".to_string())
}

fn get_extends_db_path() -> Result<PathBuf, String> {
    let setting = config::load_stellarecord_setting();
    setting
        .get_effective_extends_db_path()
        .ok_or_else(|| "拡張データベースパスが見つかりません。".to_string())
}

fn get_zst_dir() -> Result<PathBuf, String> {
    Ok(get_archive_dir()?.join("zst"))
}

fn compress_single_file(src: &Path, dst: &Path) -> Result<(), String> {
    let output = fs::File::create(dst)
        .map_err(|err| utils::command_err(&format!("Failed to create {}", dst.display()), err))?;
    let encoder = zstd::stream::Encoder::new(output, 3)
        .map_err(|err| utils::command_err("Failed to create zstd encoder", err))?
        .auto_finish();
    let mut tar = tar::Builder::new(encoder);

    let file_name = src
        .file_name()
        .ok_or_else(|| format!("Invalid file name: {}", src.display()))?;
    let mut input = fs::File::open(src)
        .map_err(|err| utils::command_err(&format!("Failed to open {}", src.display()), err))?;
    tar.append_file(file_name, &mut input)
        .map_err(|err| utils::command_err("Failed to append file to tar archive", err))?;
    tar.finish()
        .map_err(|err| utils::command_err("Failed to finish tar archive", err))?;
    Ok(())
}

fn collect_pending_archive_logs(archive_dir: &Path) -> Result<Vec<PathBuf>, String> {
    let entries = fs::read_dir(archive_dir).map_err(|err| {
        utils::command_err(&format!("Failed to read {}", archive_dir.display()), err)
    })?;
    let mut paths = Vec::new();

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(err) => {
                utils::log_warn(&format!("archive entry read failed: {}", err));
                continue;
            }
        };

        let path = entry.path();
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };
        if path.is_file() && name.starts_with("output_log_") && name.ends_with(".txt") {
            paths.push(path);
        }
    }

    Ok(paths)
}

fn collect_directory_size(path: &Path) -> Result<u64, String> {
    let metadata = fs::metadata(path).map_err(|err| {
        utils::command_err(&format!("Failed to read metadata {}", path.display()), err)
    })?;

    if metadata.is_file() {
        return Ok(metadata.len());
    }

    let entries = fs::read_dir(path)
        .map_err(|err| utils::command_err(&format!("Failed to read {}", path.display()), err))?;
    let mut total = 0u64;

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(err) => {
                utils::log_warn(&format!("storage entry read failed: {}", err));
                continue;
            }
        };

        total += collect_directory_size(&entry.path())?;
    }

    Ok(total)
}

fn compress_pending_logs_in_archive(archive_dir: &Path) -> Result<usize, String> {
    let zst_dir = archive_dir.join("zst");
    fs::create_dir_all(&zst_dir).map_err(|err| {
        utils::command_err(&format!("Failed to create {}", zst_dir.display()), err)
    })?;

    let mut count = 0usize;
    for path in collect_pending_archive_logs(archive_dir)? {
        let Some(name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };

        let zst_path = zst_dir.join(format!("{}.tar.zst", name));
        if zst_path.exists() {
            continue;
        }

        compress_single_file(&path, &zst_path)?;
        fs::remove_file(&path).map_err(|err| {
            utils::command_err(&format!("Failed to remove {}", path.display()), err)
        })?;
        count += 1;
    }

    Ok(count)
}

fn sanitize_table_name(table_name: &str) -> Result<&str, String> {
    if table_name
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || character == '_')
    {
        Ok(table_name)
    } else {
        Err("Invalid table name".to_string())
    }
}

fn build_log_viewer_data_payload(
    archive_name: &str,
    source_name: &str,
    lines: Vec<LogViewerLine>,
) -> LogViewerData {
    LogViewerData {
        archive_name: archive_name.to_string(),
        source_name: source_name.to_string(),
        lines,
    }
}

fn read_archive_entry_as_string(archive_path: &Path) -> Result<(String, String), String> {
    let file = fs::File::open(archive_path)
        .map_err(|err| utils::command_err(&format!("Failed to open {}", archive_path.display()), err))?;
    let decoder = zstd::stream::Decoder::new(file)
        .map_err(|err| utils::command_err("Failed to create zstd decoder", err))?;
    let mut archive = tar::Archive::new(decoder);
    for entry in archive
        .entries()
        .map_err(|err| utils::command_err("Failed to enumerate zst entries", err))?
    {
        let mut entry = entry.map_err(|err| utils::command_err("Failed to read zst entry", err))?;
        let entry_path = entry
            .path()
            .map_err(|err| utils::command_err("Failed to resolve zst entry path", err))?;
        let source_name = entry_path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "Invalid archive entry name".to_string())?
            .to_string();
        let mut content = String::new();
        entry
            .read_to_string(&mut content)
            .map_err(|err| utils::command_err("Failed to read archive entry text", err))?;
        return Ok((source_name, content));
    }
    Err(format!(
        "アーカイブ内にログファイルがありません: {}",
        archive_path.display()
    ))
}

fn classify_log_line(line: &str) -> (String, String) {
    if line.contains("[Behaviour] Entering Room:") {
        return ("world".to_string(), "info".to_string());
    }
    if line.contains("[Behaviour] OnLeftRoom") {
        return ("world".to_string(), "info".to_string());
    }
    if let Some(caps) = analyze::RE_DESTINATION_EVENT.captures(line) {
        let _ = caps;
        return ("travel".to_string(), "info".to_string());
    }
    if let Some(caps) = analyze::RE_GOING_HOME.captures(line) {
        let _ = caps;
        return ("travel".to_string(), "info".to_string());
    }
    if let Some(caps) = analyze::RE_PLAYER_JOIN.captures(line) {
        let _ = caps;
        return ("player_join".to_string(), "info".to_string());
    }
    if let Some(caps) = analyze::RE_PLAYER_JOIN_COMPLETE.captures(line) {
        let _ = caps;
        return ("player_ready".to_string(), "info".to_string());
    }
    if let Some(caps) = analyze::RE_PLAYER_LEFT.captures(line) {
        let _ = caps;
        return ("player_left".to_string(), "info".to_string());
    }
    if let Some(caps) = analyze::RE_NOTIFICATION.captures(line) {
        let _ = caps;
        return ("notification".to_string(), "info".to_string());
    }
    if let Some(caps) = analyze::RE_VIDEO.captures(line) {
        let _ = caps;
        return ("video".to_string(), "info".to_string());
    }
    if let Some(caps) = analyze::RE_VIDEO_ALT.captures(line) {
        let _ = caps;
        return ("video".to_string(), "info".to_string());
    }
    if line.contains("[UserInfoLogger] Environment Info:") {
        return ("debug".to_string(), "debug".to_string());
    }
    if line.contains("[UserInfoLogger] User Settings Info:") {
        return ("debug".to_string(), "debug".to_string());
    }
    if line.contains("Microphones installed (") {
        return ("debug".to_string(), "debug".to_string());
    }
    if line.contains(" Error ") || line.contains("Error      -") {
        return ("error".to_string(), "error".to_string());
    }
    if line.contains(" Warning ") || line.contains("Warning    -") {
        return ("warning".to_string(), "warning".to_string());
    }
    ("plain".to_string(), "plain".to_string())
}

fn build_log_viewer_data(archive_name: &str, source_name: &str, content: &str) -> LogViewerData {
    let reader = BufReader::new(content.as_bytes());
    let mut lines = Vec::new();

    for line in reader.lines().map_while(Result::ok) {
        let timestamp = analyze::RE_TIME
            .captures(&line)
            .and_then(|caps| caps.get(1))
            .and_then(|m| {
                NaiveDateTime::parse_from_str(m.as_str(), "%Y.%m.%d %H:%M:%S")
                    .ok()
                    .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
            })
            .unwrap_or_default();
        let (category, level) = classify_log_line(&line);
        lines.push(LogViewerLine {
            timestamp,
            level,
            category,
            raw_line: line,
        });
    }

    build_log_viewer_data_payload(archive_name, source_name, lines)
}

#[tauri::command]
pub fn list_archive_files() -> Result<Vec<String>, String> {
    let zst_dir = get_zst_dir()?;
    let mut files = Vec::new();

    if !zst_dir.exists() {
        return Ok(files);
    }

    let entries = fs::read_dir(&zst_dir)
        .map_err(|err| utils::command_err(&format!("Failed to read {}", zst_dir.display()), err))?;
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(err) => {
                utils::log_warn(&format!("archive entry read failed: {}", err));
                continue;
            }
        };

        let path = entry.path();
        if let Some(name) = path.file_name().and_then(|name| name.to_str()) {
            if path.is_file() && name.ends_with(".tar.zst") {
                files.push(name.to_string());
            }
        }
    }

    files.sort();
    files.reverse();
    Ok(files)
}

#[tauri::command]
pub fn compress_logs() -> Result<String, String> {
    let archive_dir = get_archive_dir()?;
    if !archive_dir.exists() {
        return Err("アーカイブディレクトリが存在しません。".to_string());
    }

    let count = compress_pending_logs_in_archive(&archive_dir)?;

    Ok(format!(
        "完了しました。{}個のファイルを圧縮・移動しました。",
        count
    ))
}

#[tauri::command]
pub fn read_archive_log_viewer(file_name: &str) -> Result<LogViewerData, String> {
    let archive_path = get_zst_dir()?.join(file_name);
    if !archive_path.exists() {
        return Err(format!("ファイルが見つかりません: {}", file_name));
    }

    let (source_name, content) = read_archive_entry_as_string(&archive_path)?;
    Ok(build_log_viewer_data(file_name, &source_name, &content))
}

#[tauri::command]
pub fn get_pending_archive_log_count() -> Result<usize, String> {
    let archive_dir = get_archive_dir()?;
    if !archive_dir.exists() {
        return Ok(0);
    }

    Ok(collect_pending_archive_logs(&archive_dir)?.len())
}

#[tauri::command]
pub fn launch_enhanced_import(app: AppHandle, file_names: Vec<String>) -> Result<String, String> {
    let db_path = get_db_path()?;
    let extends_db_path = get_extends_db_path()?;
    let zst_dir = get_zst_dir()?;

    let mut target_paths = Vec::new();
    for file_name in &file_names {
        let archive_path = zst_dir.join(file_name);
        if !archive_path.exists() {
            return Err(format!("ファイルが見つかりません: {}", file_name));
        }
        target_paths.push(archive_path);
    }
    let total = target_paths.len();

    std::thread::spawn(move || {
        for (index, target_path) in target_paths.into_iter().enumerate() {
            let file_label = target_path
                .file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.to_string())
                .unwrap_or_else(|| target_path.display().to_string());

            emit_analyze_progress(
                &app,
                format!("[{}/{}] {}", index + 1, total, file_label),
                format!("{}%", (index * 100) / total.max(1)),
                true,
            );

            let result =
                analyze::run_enhanced_import(
                    db_path.clone(),
                    extends_db_path.clone(),
                    target_path,
                    |status, progress| {
                    emit_analyze_progress(&app, status, progress, true);
                    },
                );

            if let Err(err) = result {
                emit_analyze_progress(&app, format!("エラー: {}", err), "0%".to_string(), false);
                utils::emit_event_warn(&app, "analyze-finished", ());
                return;
            }
        }

        emit_analyze_progress(
            &app,
            format!("{}件のインポートが完了しました。", total),
            "100%".to_string(),
            false,
        );
        utils::emit_event_warn(&app, "analyze-finished", ());
    });

    Ok(format!("{}件のアーカイブ同期を開始しました。", total))
}

#[tauri::command]
pub fn launch_external_app(app_path: &str) -> Result<(), String> {
    platform::launch_external_process(app_path)
}

#[tauri::command]
pub fn get_polaris_status() -> bool {
    platform::get_polaris_status()
}

#[tauri::command]
pub fn open_folder(path: &str) -> Result<(), String> {
    opener::open(path).map_err(|err| utils::command_err("フォルダを開けませんでした", err))
}

#[tauri::command]
pub fn get_polaris_logs() -> Result<Vec<String>, String> {
    let log_path = utils::get_polaris_install_dir()
        .map(|path| path.join("info.log"))
        .ok_or_else(|| "Polaris installation not found".to_string())?;

    if !log_path.exists() {
        return Ok(vec!["ログファイルが見つかりません。".to_string()]);
    }

    utils::read_recent_lines(log_path, 100)
}

#[tauri::command]
pub async fn launch_analyze(app: AppHandle, _mode: String) -> Result<String, String> {
    let db_path = get_db_path()?;
    let extends_db_path = get_extends_db_path()?;
    let archive_dir = get_archive_dir()?;

    std::thread::spawn(move || {
        if let Err(err) = compress_pending_logs_in_archive(&archive_dir) {
            emit_analyze_progress(
                &app,
                format!("圧縮に失敗しました: {}", err),
                "0%".to_string(),
                false,
            );
            utils::emit_event_warn(&app, "analyze-finished", ());
            return;
        }
        let result = analyze::run_diff_import(db_path, extends_db_path, archive_dir, |status, progress| {
            emit_analyze_progress(&app, status, progress, true);
        });

        match result {
            Ok(()) => emit_analyze_progress(&app, "完了".to_string(), "100%".to_string(), false),
            Err(err) => {
                emit_analyze_progress(&app, format!("エラー: {}", err), "0%".to_string(), false)
            }
        }

        utils::emit_event_warn(&app, "analyze-finished", ());
    });

    Ok("Analyze を開始しました。".to_string())
}

#[tauri::command]
pub async fn launch_startup_archive_import(app: AppHandle) -> Result<String, String> {
    let db_path = get_db_path()?;
    let extends_db_path = get_extends_db_path()?;
    let archive_dir = get_archive_dir()?;

    std::thread::spawn(move || {
        if let Err(err) = compress_pending_logs_in_archive(&archive_dir) {
            emit_analyze_progress(
                &app,
                format!("起動時圧縮に失敗しました: {}", err),
                "0%".to_string(),
                false,
            );
            utils::emit_event_warn(&app, "analyze-finished", ());
            return;
        }

        let result = analyze::run_diff_import(db_path, extends_db_path, archive_dir.clone(), |status, progress| {
            emit_analyze_progress(&app, status, progress, true);
        });

        match result {
            Ok(()) => emit_analyze_progress(
                &app,
                "zst アーカイブからの取り込みが完了しました。".to_string(),
                "100%".to_string(),
                false,
            ),
            Err(err) => {
                emit_analyze_progress(&app, format!("エラー: {}", err), "0%".to_string(), false)
            }
        }

        utils::emit_event_warn(&app, "analyze-finished", ());
    });

    Ok("未圧縮ログを zst 化し、その後に zst から取り込みます。".to_string())
}

#[tauri::command]
pub fn get_storage_status() -> Result<(u64, u64), String> {
    let setting = config::load_polaris_setting();
    let archive_dir = setting
        .get_effective_archive_dir()
        .ok_or_else(|| "アーカイブディレクトリが見つかりません。".to_string())?;

    let total_size = if archive_dir.exists() {
        collect_directory_size(&archive_dir)?
    } else {
        0
    };

    Ok((total_size, setting.capacity_threshold_bytes))
}

#[tauri::command]
pub async fn cancel_analyze() -> Result<(), String> {
    // Intentional: current analyzer has no cooperative cancel token yet; UI command remains for future wiring.
    utils::log_warn("cancel_analyze requested but not yet implemented");
    Ok(())
}

#[tauri::command]
pub fn get_db_tables() -> Result<Vec<String>, String> {
    let db_path = get_db_path()?;
    if !db_path.exists() {
        return Ok(Vec::new());
    }

    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|err| utils::command_err(&format!("Failed to open {}", db_path.display()), err))?;
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .map_err(|err| utils::command_err("Failed to prepare table list query", err))?;

    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|err| utils::command_err("Failed to execute table list query", err))?;

    let mut tables = Vec::new();
    for row in rows {
        match row {
            Ok(table_name) => tables.push(table_name),
            Err(err) => utils::log_warn(&format!("table row decode failed: {}", err)),
        }
    }

    Ok(tables)
}

#[tauri::command]
pub fn get_db_table_data(table_name: &str) -> Result<TableData, String> {
    let db_path = get_db_path()?;
    if !db_path.exists() {
        return Err("Database file not found".to_string());
    }

    let table_name = sanitize_table_name(table_name)?;
    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|err| utils::command_err(&format!("Failed to open {}", db_path.display()), err))?;
    let sql = format!("SELECT * FROM {} ORDER BY id DESC LIMIT 100", table_name);
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|err| utils::command_err(&format!("Failed to prepare query [{}]", sql), err))?;

    let column_count = stmt.column_count();
    let columns = stmt
        .column_names()
        .iter()
        .map(|name| name.to_string())
        .collect::<Vec<_>>();

    let mut rows = stmt
        .query([])
        .map_err(|err| utils::command_err("Failed to execute table data query", err))?;
    let mut result_rows = Vec::new();

    while let Some(row) = rows
        .next()
        .map_err(|err| utils::command_err("Failed to fetch table data row", err))?
    {
        let mut values = Vec::with_capacity(column_count);
        for index in 0..column_count {
            let value: rusqlite::types::Value = row
                .get(index)
                .map_err(|err| utils::command_err("Failed to decode table cell", err))?;
            values.push(match value {
                rusqlite::types::Value::Null => "NULL".to_string(),
                rusqlite::types::Value::Integer(number) => number.to_string(),
                rusqlite::types::Value::Real(number) => number.to_string(),
                rusqlite::types::Value::Text(text) => text,
                rusqlite::types::Value::Blob(_) => "<BLOB>".to_string(),
            });
        }
        result_rows.push(values);
    }

    Ok(TableData {
        columns,
        rows: result_rows,
    })
}

#[tauri::command]
pub fn delete_today_data() -> Result<String, String> {
    let db_path = get_db_path()?;
    if !db_path.exists() {
        return Err("Database file not found".to_string());
    }

    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|err| utils::command_err(&format!("Failed to open {}", db_path.display()), err))?;

    let mut visit_ids = Vec::new();
    let mut stmt = conn
        .prepare("SELECT id FROM world_visits WHERE date(join_time) = date('now', 'localtime')")
        .map_err(|err| utils::command_err("Failed to prepare today's visit query", err))?;
    let rows = stmt
        .query_map([], |row| row.get::<_, i64>(0))
        .map_err(|err| utils::command_err("Failed to fetch today's visits", err))?;
    for row in rows {
        match row {
            Ok(visit_id) => visit_ids.push(visit_id),
            Err(err) => utils::log_warn(&format!("today visit row decode failed: {}", err)),
        }
    }

    for visit_id in &visit_ids {
        conn.execute("DELETE FROM player_visit_events WHERE visit_id = ?1", [visit_id])
            .map_err(|err| utils::command_err("Failed to delete today's player visit events", err))?;
        conn.execute("DELETE FROM player_visits WHERE visit_id = ?1", [visit_id])
            .map_err(|err| utils::command_err("Failed to delete today's player visits", err))?;
        conn.execute("DELETE FROM video_playbacks WHERE visit_id = ?1", [visit_id])
            .map_err(|err| utils::command_err("Failed to delete today's video playbacks", err))?;
    }

    let affected = conn
        .execute(
            "DELETE FROM world_visits WHERE date(join_time) = date('now', 'localtime')",
            [],
        )
        .map_err(|err| utils::command_err("Failed to delete today's records", err))?;
    conn.execute(
        "DELETE FROM travel_events WHERE date(timestamp) = date('now', 'localtime')",
        [],
    )
    .map_err(|err| utils::command_err("Failed to delete today's travel events", err))?;

    Ok(format!("本日分のデータ {} 件を削除しました。", affected))
}

#[tauri::command]
pub fn wipe_database() -> Result<String, String> {
    let db_path = get_db_path()?;
    let extends_db_path = get_extends_db_path()?;
    if !db_path.exists() {
        return Err("データベースファイルが見つかりません。".to_string());
    }

    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|err| utils::command_err(&format!("Failed to open {}", db_path.display()), err))?;

    conn.execute("DELETE FROM player_visits", [])
        .map_err(|err| utils::command_err("Failed to wipe player_visits", err))?;
    conn.execute("DELETE FROM player_visit_events", [])
        .map_err(|err| utils::command_err("Failed to wipe player_visit_events", err))?;
    conn.execute("DELETE FROM video_playbacks", [])
        .map_err(|err| utils::command_err("Failed to wipe video_playbacks", err))?;
    conn.execute("DELETE FROM notifications", [])
        .map_err(|err| utils::command_err("Failed to wipe notifications", err))?;
    conn.execute("DELETE FROM travel_events", [])
        .map_err(|err| utils::command_err("Failed to wipe travel_events", err))?;
    conn.execute("DELETE FROM world_visits", [])
        .map_err(|err| utils::command_err("Failed to wipe world_visits", err))?;
    conn.execute("DELETE FROM players", [])
        .map_err(|err| utils::command_err("Failed to wipe players", err))?;
    conn.execute("DELETE FROM app_sessions", [])
        .map_err(|err| utils::command_err("Failed to wipe app_sessions", err))?;

    if let Err(err) = conn.execute("VACUUM", []) {
        utils::log_warn(&format!("VACUUM failed after wipe: {}", err));
    }

    if extends_db_path.exists() {
        let extends_conn = rusqlite::Connection::open(&extends_db_path).map_err(|err| {
            utils::command_err(&format!("Failed to open {}", extends_db_path.display()), err)
        })?;
        extends_conn
            .execute("DELETE FROM session_debug_snapshots", [])
            .map_err(|err| utils::command_err("Failed to wipe session_debug_snapshots", err))?;
        if let Err(err) = extends_conn.execute("VACUUM", []) {
            utils::log_warn(&format!("Extends VACUUM failed after wipe: {}", err));
        }
    }

    Ok("データベースを完全に初期化しました。拡張DBも消去しました。".to_string())
}

#[tauri::command]
pub fn read_registry_catalog() -> RegistryCatalog {
    config::load_registry_catalog()
}

#[tauri::command]
pub async fn start_polaris() -> Result<String, String> {
    if platform::get_polaris_status() {
        return Ok("Polaris は既に起動しています。".to_string());
    }

    let polaris_exe = platform::get_polaris_exe_path()
        .ok_or_else(|| "Polaris path could not be determined".to_string())?;
    if !polaris_exe.exists() {
        return Err("Polaris.exe が見つかりません。".to_string());
    }

    let executable = polaris_exe.to_string_lossy().to_string();
    platform::launch_external_process(&executable)?;
    Ok("Polaris を起動しました。".to_string())
}

#[tauri::command]
pub fn get_management_settings() -> ManagementSettings {
    let stella_setting = config::load_stellarecord_setting();
    let polaris_setting = config::load_polaris_setting();
    let archive_limit_mb =
        ((polaris_setting.capacity_threshold_bytes / HUNDRED_MB_BYTES).max(1)) * 100;

    ManagementSettings {
        startup_enabled: stella_setting.enable_startup,
        startup_preference_set: stella_setting.startup_preference_set,
        archive_limit_mb,
    }
}

#[tauri::command]
pub fn save_management_settings(
    startup_enabled: bool,
    archive_limit_mb: u64,
) -> Result<(), String> {
    let normalized_limit_mb = archive_limit_mb.max(100);
    let capacity_threshold_bytes = (normalized_limit_mb / 100).max(1) * HUNDRED_MB_BYTES;

    let mut stella_setting = config::load_stellarecord_setting();
    stella_setting.enable_startup = startup_enabled;
    stella_setting.startup_preference_set = true;
    config::save_stellarecord_setting(&stella_setting)?;
    platform::set_startup_enabled(STELLA_RECORD_RUN_VALUE, startup_enabled)?;

    let mut polaris_setting = config::load_polaris_setting();
    polaris_setting.capacity_threshold_bytes = capacity_threshold_bytes;
    config::save_polaris_setting(&polaris_setting)?;

    Ok(())
}
