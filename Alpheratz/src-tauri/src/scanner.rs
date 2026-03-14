use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::LazyLock;

use path_slash::PathExt;
use regex::Regex;
use rusqlite::{params, Connection, OpenFlags};
use tauri::{AppHandle, Emitter, Manager};

use crate::config::load_setting;
use crate::db::open_alpheratz_connection;
use crate::models::ScanProgress;
use crate::utils;
use crate::ScanCancelStatus;

const SUPPORTED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp"];
const PHOTO_UPSERT_BATCH_SIZE: usize = 25;
const MAX_ITXT_SIZE: usize = 4 * 1024 * 1024;
const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "vendor",
    "cache",
    "$recycle.bin",
    "system volume information",
    "thumbnails",
];

#[derive(Clone, Debug)]
struct ExistingPhotoInfo {
    photo_filename: String,
    photo_path: String,
    world_id: Option<String>,
    world_name: Option<String>,
    orientation: Option<String>,
}

#[derive(Clone, Debug)]
struct ScanPhotoData {
    filename: String,
    path: PathBuf,
    timestamp: String,
    world_id: Option<String>,
    world_name: Option<String>,
    orientation: Option<String>,
    match_source: Option<String>,
}

enum ScanRefreshKind {
    Full,
    MetadataOnly,
    PathOnly,
}

enum PhotoDirErrorKind {
    NotConfigured,
    Missing(PathBuf),
}

fn compile_regex(pattern: &str, name: &str) -> Regex {
    match Regex::new(pattern) {
        Ok(re) => re,
        Err(err) => {
            crate::utils::log_err(&format!("Invalid regex {name}: {err}"));
            Regex::new(r"^$").expect("fallback regex must be valid")
        }
    }
}

fn emit_warn<T: serde::Serialize + Clone>(app: &AppHandle, event: &str, payload: T) {
    if let Err(err) = app.emit(event, payload) {
        crate::utils::log_warn(&format!("emit failed [{}]: {}", event, err));
    }
}

fn scan_err<E: std::fmt::Display>(context: &str, err: E) -> String {
    format!("{}: {}", context, err)
}

fn warn_row_error<T, E: std::fmt::Display>(row: Result<T, E>, context: &str) -> Option<T> {
    match row {
        Ok(value) => Some(value),
        Err(err) => {
            crate::utils::log_warn(&format!("{}: {}", context, err));
            None
        }
    }
}

static RE_COLLECT: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(
        r"(?i)^VRChat_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.\d{3}",
        "RE_COLLECT",
    )
});
static RE_PARSE: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(
        r"VRChat_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.(\d{3})",
        "RE_PARSE",
    )
});
static RE_ID: LazyLock<Regex> =
    LazyLock::new(|| compile_regex(r"<vrc:WorldID>([^<]+)</vrc:WorldID>", "RE_ID"));
static RE_NAME: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(
        r"<vrc:WorldDisplayName>([^<]+)</vrc:WorldDisplayName>",
        "RE_NAME",
    )
});

fn resolve_photo_dir() -> Result<PathBuf, PhotoDirErrorKind> {
    let setting = load_setting();
    if setting.photo_folder_path.is_empty() {
        return match default_photo_dir() {
            Some(path) if path.exists() => Ok(path),
            Some(path) => Err(PhotoDirErrorKind::Missing(path)),
            None => Err(PhotoDirErrorKind::NotConfigured),
        };
    }

    let configured_path = PathBuf::from(&setting.photo_folder_path);
    if configured_path.exists() {
        Ok(configured_path)
    } else {
        Err(PhotoDirErrorKind::Missing(configured_path))
    }
}

pub async fn do_scan(app: AppHandle) -> Result<(), String> {
    let photo_dir = match resolve_photo_dir() {
        Ok(path) => path,
        Err(PhotoDirErrorKind::NotConfigured) => {
            let message =
                "写真フォルダが未設定です。設定から VRChat の写真フォルダを選択してください。";
            emit_warn(&app, "scan:error", message);
            return Err(message.to_string());
        }
        Err(PhotoDirErrorKind::Missing(path)) => {
            let message = format!(
                "写真フォルダが見つかりません。設定を確認してください: {}",
                path.display()
            );
            emit_warn(&app, "scan:error", message.clone());
            return Err(message);
        }
    };

    let mut conn = open_alpheratz_connection()?;
    let cancel_status = app.state::<ScanCancelStatus>();
    emit_warn(
        &app,
        "scan:progress",
        ScanProgress {
            processed: 0,
            total: 0,
            current_world: "Collecting files...".into(),
            phase: "scan".into(),
        },
    );

    let existing_photos = get_existing_photos(&conn)?;
    let mut found_files = Vec::new();
    collect_photos_recursive(&photo_dir, &mut found_files, &RE_COLLECT, &cancel_status);

    if cancel_status.0.load(Ordering::SeqCst) {
        crate::utils::log_warn("Scan cancelled during collection.");
        emit_warn(&app, "scan:error", "Scan cancelled");
        return Ok(());
    }

    let found_filename_set: HashSet<String> = found_files
        .iter()
        .map(|(filename, _)| filename.clone())
        .collect();
    delete_missing_photos(&conn, &existing_photos, &found_filename_set)?;

    let candidate_files: Vec<(String, PathBuf, ScanRefreshKind)> = found_files
        .into_iter()
        .filter_map(|(filename, path)| match existing_photos.get(&filename) {
            None => Some((filename, path, ScanRefreshKind::Full)),
            Some(existing) => {
                let path_changed = existing.photo_path != path.to_slash_lossy();
                let missing_features = existing.orientation.is_none();
                let missing_world = existing.world_name.is_none() && existing.world_id.is_none();

                if missing_features {
                    Some((filename, path, ScanRefreshKind::Full))
                } else if path_changed {
                    Some((filename, path, ScanRefreshKind::PathOnly))
                } else if missing_world && filename.to_ascii_lowercase().ends_with(".png") {
                    Some((filename, path, ScanRefreshKind::MetadataOnly))
                } else {
                    None
                }
            }
        })
        .collect();

    let total = candidate_files.len();
    emit_warn(
        &app,
        "scan:progress",
        ScanProgress {
            processed: 0,
            total,
            current_world: format!("{} files to refresh", total),
            phase: "scan".into(),
        },
    );

    let mut upsert_batch = Vec::with_capacity(PHOTO_UPSERT_BATCH_SIZE);

    for (index, (filename, path, refresh_kind)) in candidate_files.into_iter().enumerate() {
        if cancel_status.0.load(Ordering::SeqCst) {
            crate::utils::log_warn("Scan cancelled by user.");
            emit_warn(&app, "scan:error", "Scan cancelled");
            return Ok(());
        }

        if let Some(photo) = analyze_photo(&path, &filename, &existing_photos, refresh_kind)? {
            let current_world = photo
                .world_name
                .clone()
                .unwrap_or_else(|| "Unknown world".to_string());
            upsert_batch.push(photo);

            if upsert_batch.len() >= PHOTO_UPSERT_BATCH_SIZE {
                upsert_photo_batch(&mut conn, &upsert_batch)?;
                upsert_batch.clear();
            }

            if index % 10 == 0 || index == total.saturating_sub(1) {
                emit_warn(
                    &app,
                    "scan:progress",
                    ScanProgress {
                        processed: index + 1,
                        total,
                        current_world,
                        phase: "scan".into(),
                    },
                );
            }
        }
    }

    if !upsert_batch.is_empty() {
        upsert_photo_batch(&mut conn, &upsert_batch)?;
    }

    emit_warn(&app, "scan:completed", ());
    Ok(())
}

fn default_photo_dir() -> Option<PathBuf> {
    let user_dirs = directories::UserDirs::new()?;
    Some(user_dirs.picture_dir()?.join("VRChat"))
}

fn get_existing_photos(conn: &Connection) -> Result<HashMap<String, ExistingPhotoInfo>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT photo_filename, photo_path, world_id, world_name, timestamp, orientation
             FROM photos",
        )
        .map_err(|e| scan_err("Failed to prepare existing photo query", e))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ExistingPhotoInfo {
                photo_filename: row.get(0)?,
                photo_path: row.get(1)?,
                world_id: row.get(2)?,
                world_name: row.get(3)?,
                orientation: row.get(5)?,
            })
        })
        .map_err(|e| scan_err("Failed to execute existing photo query", e))?;

    let mut map = HashMap::new();
    for row in rows {
        if let Some(info) = warn_row_error(row, "existing photo row decode failed") {
            map.insert(info.photo_filename.clone(), info);
        }
    }

    Ok(map)
}

fn analyze_photo(
    path: &Path,
    filename: &str,
    existing_photos: &HashMap<String, ExistingPhotoInfo>,
    refresh_kind: ScanRefreshKind,
) -> Result<Option<ScanPhotoData>, String> {
    let Some(captures) = RE_PARSE.captures(filename) else {
        return Ok(None);
    };
    let timestamp = format!("{} {}", &captures[1], captures[2].replace("-", ":"));

    let existing = existing_photos.get(filename);
    let (world_name, world_id, match_source) = match refresh_kind {
        ScanRefreshKind::PathOnly => (
            existing.and_then(|photo| photo.world_name.clone()),
            existing.and_then(|photo| photo.world_id.clone()),
            None,
        ),
        ScanRefreshKind::Full | ScanRefreshKind::MetadataOnly => {
            resolve_world_info_lightweight(filename, path, &timestamp, existing_photos)
        }
    };
    let orientation = match refresh_kind {
        ScanRefreshKind::PathOnly | ScanRefreshKind::MetadataOnly => {
            existing.and_then(|photo| photo.orientation.clone())
        }
        ScanRefreshKind::Full => read_image_orientation(path),
    };

    Ok(Some(ScanPhotoData {
        filename: filename.to_string(),
        path: path.to_path_buf(),
        timestamp,
        world_id,
        world_name,
        orientation,
        match_source,
    }))
}

fn resolve_world_info_lightweight(
    filename: &str,
    path: &Path,
    timestamp: &str,
    existing_photos: &HashMap<String, ExistingPhotoInfo>,
) -> (Option<String>, Option<String>, Option<String>) {
    if filename.to_ascii_lowercase().ends_with(".png") {
        let (name, id) = extract_vrc_metadata_from_png(path);
        if name.is_some() || id.is_some() {
            return (name, id, Some("metadata".to_string()));
        }
    }

    if let Some(existing) = existing_photos.get(filename) {
        if existing.world_name.is_some() || existing.world_id.is_some() {
            return (
                existing.world_name.clone(),
                existing.world_id.clone(),
                Some("title".to_string()),
            );
        }
    }

    if let Some(world_name) = lookup_world_name_from_stella_record(timestamp) {
        return (Some(world_name), None, Some("stella_db".to_string()));
    }

    (None, None, None)
}

fn lookup_world_name_from_stella_record(timestamp: &str) -> Option<String> {
    let db_path = utils::get_stella_record_install_dir()?.join("stellarecord.db");
    if !db_path.exists() {
        return None;
    }

    let conn = match Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY) {
        Ok(conn) => conn,
        Err(err) => {
            crate::utils::log_warn(&format!(
                "STELLA RECORD DB を開けません ({}): {}",
                db_path.display(),
                err
            ));
            return None;
        }
    };

    let sql = "SELECT world_name
        FROM world_visits
        WHERE join_time <= ?1
          AND (leave_time IS NULL OR leave_time >= ?1)
        ORDER BY join_time DESC
        LIMIT 1";

    match conn.query_row(sql, params![timestamp], |row| row.get::<_, String>(0)) {
        Ok(world_name) => Some(world_name),
        Err(rusqlite::Error::QueryReturnedNoRows) => None,
        Err(err) => {
            crate::utils::log_warn(&format!(
                "STELLA RECORD のワールド名参照に失敗しました [{}]: {}",
                timestamp, err
            ));
            None
        }
    }
}

fn read_image_orientation(path: &Path) -> Option<String> {
    let image = match image::open(path) {
        Ok(image) => image,
        Err(err) => {
            crate::utils::log_warn(&format!(
                "Failed to open image [{}]: {}",
                path.display(),
                err
            ));
            return None;
        }
    };

    Some(if image.height() > image.width() {
        "portrait".to_string()
    } else {
        "landscape".to_string()
    })
}

fn delete_missing_photos(
    conn: &Connection,
    existing_photos: &HashMap<String, ExistingPhotoInfo>,
    found_filenames: &HashSet<String>,
) -> Result<(), String> {
    let missing: Vec<String> = existing_photos
        .keys()
        .filter(|filename| !found_filenames.contains(*filename))
        .cloned()
        .collect();

    if missing.is_empty() {
        return Ok(());
    }

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| scan_err("Failed to start delete transaction", e))?;
    {
        let mut delete_tags = tx
            .prepare("DELETE FROM photo_tags WHERE photo_filename = ?1")
            .map_err(|e| scan_err("Failed to prepare tag delete statement", e))?;
        let mut delete_photos = tx
            .prepare("DELETE FROM photos WHERE photo_filename = ?1")
            .map_err(|e| scan_err("Failed to prepare photo delete statement", e))?;

        for filename in missing {
            delete_tags
                .execute(params![filename])
                .map_err(|e| scan_err("Failed to delete photo tags", e))?;
            delete_photos
                .execute(params![filename])
                .map_err(|e| scan_err("Failed to delete missing photo", e))?;
        }
    }
    tx.commit()
        .map_err(|e| scan_err("Failed to commit delete transaction", e))?;
    Ok(())
}

fn upsert_photo_batch(conn: &mut Connection, items: &[ScanPhotoData]) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start insert transaction: {}", e))?;
    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO photos (
                    photo_filename,
                    photo_path,
                    world_id,
                    world_name,
                    timestamp,
                    orientation,
                    match_source
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                ON CONFLICT(photo_filename) DO UPDATE SET
                    photo_path = excluded.photo_path,
                    world_id = COALESCE(excluded.world_id, photos.world_id),
                    world_name = COALESCE(excluded.world_name, photos.world_name),
                    timestamp = excluded.timestamp,
                    orientation = COALESCE(excluded.orientation, photos.orientation),
                    match_source = COALESCE(excluded.match_source, photos.match_source)",
            )
            .map_err(|e| format!("Failed to prepare insert statement: {}", e))?;

        for item in items {
            stmt.execute(params![
                item.filename,
                item.path.to_slash_lossy().to_string(),
                item.world_id,
                item.world_name,
                item.timestamp,
                item.orientation,
                item.match_source,
            ])
            .map_err(|e| format!("Failed to upsert photo {}: {}", item.filename, e))?;
        }
    }
    tx.commit()
        .map_err(|e| format!("Failed to commit insert transaction: {}", e))?;
    Ok(())
}

fn extract_vrc_metadata_from_png(path: &Path) -> (Option<String>, Option<String>) {
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(err) => {
            crate::utils::log_err(&format!("[PNG parse] Failed to open {:?}: {}", path, err));
            return (None, None);
        }
    };

    let mut reader = BufReader::new(file);
    let mut sig = [0u8; 8];
    if reader.read_exact(&mut sig).is_err() || sig != *b"\x89PNG\r\n\x1a\n" {
        crate::utils::log_warn(&format!("[PNG parse] Invalid PNG signature for {:?}", path));
        return (None, None);
    }

    let mut chunk_data = Vec::new();
    loop {
        let mut header = [0u8; 8];
        if reader.read_exact(&mut header).is_err() {
            break;
        }

        let chunk_len = u32::from_be_bytes([header[0], header[1], header[2], header[3]]) as usize;
        let chunk_type = [header[4], header[5], header[6], header[7]];

        if &chunk_type == b"iTXt" {
            if chunk_len > MAX_ITXT_SIZE {
                if let Err(err) = reader.seek(SeekFrom::Current(chunk_len as i64 + 4)) {
                    crate::utils::log_warn(&format!(
                        "[PNG parse] Failed to seek after iTXt skip: {}",
                        err
                    ));
                    break;
                }
                continue;
            }
            chunk_data.clear();
            chunk_data.resize(chunk_len, 0u8);
            if reader.read_exact(&mut chunk_data).is_err() {
                crate::utils::log_err("[PNG parse] Failed to read iTXt chunk data");
                break;
            }
            if let Some(null_pos) = chunk_data.iter().position(|&b| b == 0) {
                let keyword = String::from_utf8_lossy(&chunk_data[..null_pos]);
                if keyword == "XML:com.adobe.xmp" {
                    let mut pos = null_pos + 1;
                    if pos + 2 <= chunk_data.len() {
                        pos += 2;
                        if let Some(lang_null) = chunk_data[pos..].iter().position(|&b| b == 0) {
                            pos += lang_null + 1;
                            if let Some(tk_null) = chunk_data[pos..].iter().position(|&b| b == 0) {
                                pos += tk_null + 1;
                                let xmp_text = String::from_utf8_lossy(&chunk_data[pos..]);
                                return parse_vrc_from_xmp(&xmp_text);
                            }
                        }
                    }
                }
            }
            if let Err(err) = reader.seek(SeekFrom::Current(4)) {
                crate::utils::log_warn(&format!(
                    "[PNG parse] Failed to seek after iTXt CRC: {}",
                    err
                ));
                break;
            }
        } else if &chunk_type == b"IDAT" || &chunk_type == b"IEND" {
            break;
        } else if let Err(err) = reader.seek(SeekFrom::Current(chunk_len as i64 + 4)) {
            crate::utils::log_warn(&format!(
                "[PNG parse] Failed to seek after chunk skip: {}",
                err
            ));
            break;
        }
    }

    (None, None)
}

fn parse_vrc_from_xmp(xmp: &str) -> (Option<String>, Option<String>) {
    let world_id = RE_ID
        .captures(xmp)
        .and_then(|capture| capture.get(1))
        .map(|match_value| match_value.as_str().to_string());
    let world_name = RE_NAME
        .captures(xmp)
        .and_then(|capture| capture.get(1))
        .map(|match_value| match_value.as_str().to_string());
    (world_name, world_id)
}

fn collect_photos_recursive(
    dir: &Path,
    files: &mut Vec<(String, PathBuf)>,
    re: &Regex,
    cancel_status: &ScanCancelStatus,
) {
    if cancel_status.0.load(Ordering::SeqCst) {
        return;
    }

    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(err) => {
            crate::utils::log_warn(&format!(
                "Failed to read directory {}: {}",
                dir.display(),
                err
            ));
            return;
        }
    };

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(err) => {
                crate::utils::log_warn(&format!(
                    "Failed to read entry in {}: {}",
                    dir.display(),
                    err
                ));
                continue;
            }
        };

        let path = entry.path();
        if let Ok(meta) = fs::symlink_metadata(&path) {
            if meta.file_type().is_symlink() {
                continue;
            }
        }

        if path.is_dir() {
            if let Some(name) = path.file_name().and_then(|value| value.to_str()) {
                let name_lower = name.to_lowercase();
                if name.starts_with('.') || SKIP_DIRS.contains(&name_lower.as_str()) {
                    continue;
                }
            }
            collect_photos_recursive(&path, files, re, cancel_status);
            if cancel_status.0.load(Ordering::SeqCst) {
                return;
            }
        } else if path.is_file() {
            if let Some(filename) = path.file_name().and_then(|value| value.to_str()) {
                if filename.to_lowercase().starts_with("vrchat_")
                    && re.is_match(filename)
                    && is_supported_image_extension(filename)
                {
                    files.push((filename.to_string(), path.to_path_buf()));
                }
            }
        }
    }
}

fn is_supported_image_extension(filename: &str) -> bool {
    let ext = Path::new(filename)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    match ext {
        Some(ext) => SUPPORTED_EXTENSIONS.contains(&ext.as_str()),
        None => false,
    }
}
