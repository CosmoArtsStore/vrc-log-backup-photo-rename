use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::LazyLock;

use chrono::{DateTime, Local};
use path_slash::PathExt;
use regex::Regex;
use rusqlite::{params, Connection, OpenFlags};
use tauri::{AppHandle, Emitter, Manager};

use crate::config::load_setting;
use crate::db::open_alpheratz_connection;
use crate::models::ScanProgress;
use crate::phash;
use crate::utils;
use crate::ScanCancelStatus;

const SUPPORTED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "psd", "xcf"];
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
    is_missing: bool,
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
    collect_photos_recursive(&photo_dir, &mut found_files, &cancel_status);

    if cancel_status.0.load(Ordering::SeqCst) {
        crate::utils::log_warn("Scan cancelled during collection.");
        emit_warn(&app, "scan:error", "Scan cancelled");
        return Ok(());
    }

    let found_path_set: HashSet<String> = found_files
        .iter()
        .map(|(_, path)| path.to_slash_lossy().to_string())
        .collect();
    mark_missing_photos(&conn, &existing_photos, &found_path_set)?;

    let candidate_files: Vec<(String, PathBuf, ScanRefreshKind)> = found_files
        .into_iter()
        .filter_map(|(filename, path)| {
            let normalized_path = path.to_slash_lossy().to_string();
            match existing_photos.get(&normalized_path) {
                None => Some((filename, path, ScanRefreshKind::Full)),
                Some(existing) => {
                    let filename_changed = existing.photo_filename != filename;
                    let missing_features = existing.orientation.is_none();
                    let missing_world = existing.world_name.is_none() && existing.world_id.is_none();
                    let reappeared = existing.is_missing;

                    if reappeared || missing_features {
                        Some((filename, path, ScanRefreshKind::Full))
                    } else if filename_changed {
                        Some((filename, path, ScanRefreshKind::PathOnly))
                    } else if missing_world && filename.to_ascii_lowercase().ends_with(".png") {
                        Some((filename, path, ScanRefreshKind::MetadataOnly))
                    } else {
                        None
                    }
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
            "SELECT photo_filename, photo_path, world_id, world_name, timestamp, orientation, is_missing
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
                is_missing: row.get::<_, i64>(6)? != 0,
            })
        })
        .map_err(|e| scan_err("Failed to execute existing photo query", e))?;

    let mut map = HashMap::new();
    for row in rows {
        if let Some(info) = warn_row_error(row, "existing photo row decode failed") {
            map.insert(info.photo_path.clone(), info);
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
    let timestamp = resolve_photo_timestamp(path, filename)?;

    let normalized_path = path.to_slash_lossy().to_string();
    let existing = existing_photos.get(&normalized_path);
    let (world_name, world_id, match_source) = match refresh_kind {
        ScanRefreshKind::PathOnly => (
            existing.and_then(|photo| photo.world_name.clone()),
            existing.and_then(|photo| photo.world_id.clone()),
            None,
        ),
        ScanRefreshKind::Full | ScanRefreshKind::MetadataOnly => {
            resolve_world_info_lightweight(&normalized_path, filename, path, &timestamp, existing_photos)
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
    photo_path: &str,
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

    if let Some(existing) = existing_photos.get(photo_path) {
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

    match phash::infer_world_name_from_unknown_photo(path) {
        Ok(Some(phash_match)) => {
            return (
                Some(phash_match.world_name),
                None,
                Some("phash".to_string()),
            );
        }
        Ok(None) => {}
        Err(err) => {
            crate::utils::log_warn(&format!(
                "pHash 補完に失敗しました [{}]: {}",
                path.display(),
                err
            ));
        }
    }

    (None, None, None)
}

fn resolve_photo_timestamp(path: &Path, filename: &str) -> Result<String, String> {
    if let Some(captures) = RE_PARSE.captures(filename) {
        return Ok(format!("{} {}", &captures[1], captures[2].replace("-", ":")));
    }

    let metadata = fs::metadata(path)
        .map_err(|err| scan_err(&format!("Failed to read metadata for {}", path.display()), err))?;
    let modified = metadata.modified().map_err(|err| {
        scan_err(
            &format!("Failed to read modified time for {}", path.display()),
            err,
        )
    })?;
    let local_time: DateTime<Local> = DateTime::from(modified);
    Ok(local_time.format("%Y-%m-%d %H:%M:%S").to_string())
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
    let (width, height) = match read_image_dimensions(path) {
        Some(size) => size,
        None => return None,
    };

    Some(if height > width {
        "portrait".to_string()
    } else {
        "landscape".to_string()
    })
}

fn read_image_dimensions(path: &Path) -> Option<(u32, u32)> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())?;

    match extension.as_str() {
        "png" => read_png_dimensions(path),
        "jpg" | "jpeg" => read_jpeg_dimensions(path),
        "webp" => read_webp_dimensions(path),
        "psd" => read_psd_dimensions(path),
        "xcf" => read_xcf_dimensions(path),
        _ => None,
    }
}

fn read_png_dimensions(path: &Path) -> Option<(u32, u32)> {
    let mut reader = BufReader::new(fs::File::open(path).ok()?);
    let mut header = [0u8; 24];
    reader.read_exact(&mut header).ok()?;
    if &header[..8] != b"\x89PNG\r\n\x1a\n" || &header[12..16] != b"IHDR" {
        return None;
    }
    let width = u32::from_be_bytes([header[16], header[17], header[18], header[19]]);
    let height = u32::from_be_bytes([header[20], header[21], header[22], header[23]]);
    Some((width, height))
}

fn read_jpeg_dimensions(path: &Path) -> Option<(u32, u32)> {
    let mut reader = BufReader::new(fs::File::open(path).ok()?);
    let mut marker = [0u8; 2];
    reader.read_exact(&mut marker).ok()?;
    if marker != [0xFF, 0xD8] {
        return None;
    }

    loop {
        reader.read_exact(&mut marker[..1]).ok()?;
        while marker[0] != 0xFF {
            reader.read_exact(&mut marker[..1]).ok()?;
        }

        reader.read_exact(&mut marker[1..2]).ok()?;
        while marker[1] == 0xFF {
            reader.read_exact(&mut marker[1..2]).ok()?;
        }

        let segment_type = marker[1];
        if segment_type == 0xD9 || segment_type == 0xDA {
            return None;
        }

        let mut segment_len_buf = [0u8; 2];
        reader.read_exact(&mut segment_len_buf).ok()?;
        let segment_len = u16::from_be_bytes(segment_len_buf);
        if segment_len < 2 {
            return None;
        }

        if matches!(
            segment_type,
            0xC0 | 0xC1 | 0xC2 | 0xC3 | 0xC5 | 0xC6 | 0xC7 | 0xC9 | 0xCA | 0xCB | 0xCD | 0xCE | 0xCF
        ) {
            let mut sof = vec![0u8; usize::from(segment_len) - 2];
            reader.read_exact(&mut sof).ok()?;
            if sof.len() < 5 {
                return None;
            }
            let height = u16::from_be_bytes([sof[1], sof[2]]) as u32;
            let width = u16::from_be_bytes([sof[3], sof[4]]) as u32;
            return Some((width, height));
        }

        reader
            .seek(SeekFrom::Current(i64::from(segment_len) - 2))
            .ok()?;
    }
}

fn read_webp_dimensions(path: &Path) -> Option<(u32, u32)> {
    let mut reader = BufReader::new(fs::File::open(path).ok()?);
    let mut header = [0u8; 30];
    reader.read_exact(&mut header).ok()?;
    if &header[0..4] != b"RIFF" || &header[8..12] != b"WEBP" {
        return None;
    }

    match &header[12..16] {
        b"VP8X" => {
            let width = 1 + u32::from_le_bytes([header[24], header[25], header[26], 0]);
            let height = 1 + u32::from_le_bytes([header[27], header[28], header[29], 0]);
            Some((width, height))
        }
        b"VP8 " => {
            let width = u16::from_le_bytes([header[26], header[27]]) as u32 & 0x3FFF;
            let height = u16::from_le_bytes([header[28], header[29]]) as u32 & 0x3FFF;
            Some((width, height))
        }
        b"VP8L" => {
            let bits = u32::from_le_bytes([header[21], header[22], header[23], header[24]]);
            let width = (bits & 0x3FFF) + 1;
            let height = ((bits >> 14) & 0x3FFF) + 1;
            Some((width, height))
        }
        _ => None,
    }
}

fn read_psd_dimensions(path: &Path) -> Option<(u32, u32)> {
    let mut reader = BufReader::new(fs::File::open(path).ok()?);
    let mut header = [0u8; 26];
    reader.read_exact(&mut header).ok()?;
    if &header[0..4] != b"8BPS" {
        return None;
    }
    let height = u32::from_be_bytes([header[14], header[15], header[16], header[17]]);
    let width = u32::from_be_bytes([header[18], header[19], header[20], header[21]]);
    Some((width, height))
}

fn read_xcf_dimensions(path: &Path) -> Option<(u32, u32)> {
    let bytes = fs::read(path).ok()?;
    if !bytes.starts_with(b"gimp xcf ") {
        return None;
    }
    let version_end = bytes.iter().position(|byte| *byte == 0)?;
    let width_offset = version_end + 1;
    if bytes.len() < width_offset + 8 {
        return None;
    }
    let width = u32::from_be_bytes([
        bytes[width_offset],
        bytes[width_offset + 1],
        bytes[width_offset + 2],
        bytes[width_offset + 3],
    ]);
    let height = u32::from_be_bytes([
        bytes[width_offset + 4],
        bytes[width_offset + 5],
        bytes[width_offset + 6],
        bytes[width_offset + 7],
    ]);
    Some((width, height))
}

fn mark_missing_photos(
    conn: &Connection,
    existing_photos: &HashMap<String, ExistingPhotoInfo>,
    found_paths: &HashSet<String>,
) -> Result<(), String> {
    let missing: Vec<String> = existing_photos
        .keys()
        .filter(|path| !found_paths.contains(*path))
        .cloned()
        .collect();

    if missing.is_empty() {
        return Ok(());
    }

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| scan_err("Failed to start missing mark transaction", e))?;
    {
        let mut mark_missing = tx
            .prepare("UPDATE photos SET is_missing = 1 WHERE photo_path = ?1")
            .map_err(|e| scan_err("Failed to prepare missing mark statement", e))?;

        for photo_path in missing {
            mark_missing
                .execute(params![photo_path])
                .map_err(|e| scan_err("Failed to mark missing photo", e))?;
        }
    }
    tx.commit()
        .map_err(|e| scan_err("Failed to commit missing mark transaction", e))?;
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
                    photo_path,
                    photo_filename,
                    world_id,
                    world_name,
                    timestamp,
                    orientation,
                    match_source,
                    is_missing
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 0)
                ON CONFLICT(photo_path) DO UPDATE SET
                    photo_filename = excluded.photo_filename,
                    world_id = COALESCE(excluded.world_id, photos.world_id),
                    world_name = COALESCE(excluded.world_name, photos.world_name),
                    timestamp = excluded.timestamp,
                    orientation = COALESCE(excluded.orientation, photos.orientation),
                    match_source = COALESCE(excluded.match_source, photos.match_source),
                    is_missing = 0",
            )
            .map_err(|e| format!("Failed to prepare insert statement: {}", e))?;

        for item in items {
            stmt.execute(params![
                item.path.to_slash_lossy().to_string(),
                item.filename,
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
            collect_photos_recursive(&path, files, cancel_status);
            if cancel_status.0.load(Ordering::SeqCst) {
                return;
            }
        } else if path.is_file() {
            if let Some(filename) = path.file_name().and_then(|value| value.to_str()) {
                if is_supported_image_extension(filename) {
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
