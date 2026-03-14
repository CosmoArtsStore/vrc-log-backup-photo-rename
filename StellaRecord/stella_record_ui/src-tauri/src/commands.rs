use std::fs;
use std::path::{Path, PathBuf};

use tauri::AppHandle;

use crate::analyze;
use crate::config::{self, AppCard};
use crate::models::{AnalyzePayload, TableData};
use crate::{platform, utils};

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

#[tauri::command]
pub fn list_archive_files() -> Result<Vec<String>, String> {
    let zst_dir = get_archive_dir()?.join("zst");
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

    let zst_dir = archive_dir.join("zst");
    fs::create_dir_all(&zst_dir).map_err(|err| {
        utils::command_err(&format!("Failed to create {}", zst_dir.display()), err)
    })?;

    let entries = fs::read_dir(&archive_dir).map_err(|err| {
        utils::command_err(&format!("Failed to read {}", archive_dir.display()), err)
    })?;
    let mut count = 0usize;

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
        if !(path.is_file() && name.starts_with("output_log_") && name.ends_with(".txt")) {
            continue;
        }

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

    Ok(format!(
        "完了しました。{}個のファイルを圧縮・移動しました。",
        count
    ))
}

#[tauri::command]
pub fn decompress_logs(file_names: Vec<String>) -> Result<String, String> {
    let archive_dir = get_archive_dir()?;
    let zst_dir = archive_dir.join("zst");
    if !zst_dir.exists() {
        return Err("zst フォルダが存在しません。".to_string());
    }

    let mut success_count = 0usize;
    let mut skip_count = 0usize;

    for file_name in file_names {
        let archive_path = zst_dir.join(&file_name);
        if !archive_path.exists() {
            return Err(format!("ファイルが見つかりません: {}", file_name));
        }

        let restored_name = file_name.replace(".tar.zst", "");
        let restored_path = archive_dir.join(&restored_name);
        if restored_path.exists() {
            skip_count += 1;
            continue;
        }

        let input = fs::File::open(&archive_path).map_err(|err| {
            utils::command_err(&format!("Failed to open {}", archive_path.display()), err)
        })?;
        let decoder = zstd::stream::Decoder::new(input)
            .map_err(|err| utils::command_err("Failed to create zstd decoder", err))?;
        let mut archive = tar::Archive::new(decoder);
        archive
            .unpack(&archive_dir)
            .map_err(|err| utils::command_err("Failed to unpack archive", err))?;

        if !restored_path.exists() {
            return Err(format!("展開に失敗しました: {}", restored_name));
        }

        fs::remove_file(&archive_path).map_err(|err| {
            utils::command_err(&format!("Failed to remove {}", archive_path.display()), err)
        })?;
        success_count += 1;
    }

    if skip_count > 0 {
        Ok(format!(
            "{}個を展開しました。{}個は既に展開済みでスキップしました。",
            success_count, skip_count
        ))
    } else {
        Ok(format!(
            "{}個のアーカイブを展開し、元ファイルを削除しました。",
            success_count
        ))
    }
}

#[tauri::command]
pub fn launch_enhanced_import(app: AppHandle, file_names: Vec<String>) -> Result<String, String> {
    let db_path = get_db_path()?;
    let zst_dir = get_archive_dir()?.join("zst");

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
                analyze::run_enhanced_import(db_path.clone(), target_path, |status, progress| {
                    emit_analyze_progress(&app, status, progress, true);
                });

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
    let archive_dir = get_archive_dir()?;

    std::thread::spawn(move || {
        let result = analyze::run_diff_import(db_path, archive_dir, |status, progress| {
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
pub fn get_storage_status() -> Result<(u64, u64), String> {
    let setting = config::load_polaris_setting();
    let archive_dir = setting
        .get_effective_archive_dir()
        .ok_or_else(|| "アーカイブディレクトリが見つかりません。".to_string())?;

    let mut total_size = 0u64;
    if archive_dir.exists() {
        let entries = fs::read_dir(&archive_dir).map_err(|err| {
            utils::command_err(&format!("Failed to read {}", archive_dir.display()), err)
        })?;
        for entry in entries {
            let entry = match entry {
                Ok(entry) => entry,
                Err(err) => {
                    utils::log_warn(&format!("storage entry read failed: {}", err));
                    continue;
                }
            };
            match entry.metadata() {
                Ok(metadata) if metadata.is_file() => total_size += metadata.len(),
                Ok(_) => {}
                Err(err) => utils::log_warn(&format!("metadata read failed: {}", err)),
            }
        }
    }

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
    let affected = conn
        .execute(
            "DELETE FROM world_visits WHERE date(join_time) = date('now', 'localtime')",
            [],
        )
        .map_err(|err| utils::command_err("Failed to delete today's records", err))?;

    Ok(format!("本日分のデータ {} 件を削除しました。", affected))
}

#[tauri::command]
pub fn wipe_database() -> Result<String, String> {
    let db_path = get_db_path()?;
    if !db_path.exists() {
        return Err("データベースファイルが見つかりません。".to_string());
    }

    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|err| utils::command_err(&format!("Failed to open {}", db_path.display()), err))?;

    conn.execute("DELETE FROM player_visits", [])
        .map_err(|err| utils::command_err("Failed to wipe player_visits", err))?;
    conn.execute("DELETE FROM video_playbacks", [])
        .map_err(|err| utils::command_err("Failed to wipe video_playbacks", err))?;
    conn.execute("DELETE FROM notifications", [])
        .map_err(|err| utils::command_err("Failed to wipe notifications", err))?;
    conn.execute("DELETE FROM world_visits", [])
        .map_err(|err| utils::command_err("Failed to wipe world_visits", err))?;
    conn.execute("DELETE FROM players", [])
        .map_err(|err| utils::command_err("Failed to wipe players", err))?;
    conn.execute("DELETE FROM app_sessions", [])
        .map_err(|err| utils::command_err("Failed to wipe app_sessions", err))?;

    if let Err(err) = conn.execute("VACUUM", []) {
        utils::log_warn(&format!("VACUUM failed after wipe: {}", err));
    }

    Ok("データベースを完全に初期化しました。".to_string())
}

#[tauri::command]
pub fn read_launcher_json(section: &str) -> Vec<AppCard> {
    let filename = if section == "pleiades" {
        "pleiades.json"
    } else {
        "jewelbox.json"
    };
    config::load_launcher_json(filename)
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
