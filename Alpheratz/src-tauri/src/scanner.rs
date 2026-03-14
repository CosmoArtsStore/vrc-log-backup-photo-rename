use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::LazyLock;

use path_slash::PathExt;
use regex::Regex;
use rusqlite::{params, Connection};
use tauri::{AppHandle, Emitter, Manager};

use crate::config::load_setting;
use crate::db::open_alpheratz_connection;
use crate::models::ScanProgress;
use crate::ScanCancelStatus;

const SUPPORTED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp"];
const PHASH_BATCH_SIZE: usize = 50;
const PHOTO_UPSERT_BATCH_SIZE: usize = 25;
const MAX_ITXT_SIZE: usize = 4 * 1024 * 1024;
const PHASH_MATCH_THRESHOLD: u32 = 6;
const HUE_BUCKETS: usize = 12;
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
    timestamp: String,
    width: Option<u32>,
    height: Option<u32>,
    orientation: Option<String>,
    phash: Option<String>,
    histogram: Option<Vec<f32>>,
}

#[derive(Clone, Debug)]
struct ScanPhotoData {
    filename: String,
    path: PathBuf,
    timestamp: String,
    world_id: Option<String>,
    world_name: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    orientation: Option<String>,
    histogram: Option<Vec<f32>>,
    phash: Option<String>,
    match_source: Option<String>,
}

enum ScanRefreshKind {
    Full,
    MetadataOnly,
    PathOnly,
}

fn compile_regex(pattern: &str, name: &str) -> Regex {
    match Regex::new(pattern) {
        Ok(re) => re,
        Err(err) => {
            crate::utils::log_err(&format!("Invalid regex {name}: {err}"));
            // Intentional: fallback regex is static; failure here means process cannot safely continue.
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

pub async fn do_scan(app: AppHandle) -> Result<(), String> {
    let setting = load_setting();
    let photo_dir = if setting.photo_folder_path.is_empty() {
        default_photo_dir()
    } else {
        Some(PathBuf::from(&setting.photo_folder_path))
    };

    let photo_dir = match photo_dir {
        Some(path) if path.exists() => path,
        _ => {
            emit_warn(&app, "scan:error", "Photo folder not found");
            return Err("Folder not found".into());
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
                let missing_features = existing.width.is_none()
                    || existing.height.is_none()
                    || existing.orientation.is_none()
                    || existing.histogram.is_none()
                    || existing.phash.is_none();
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

        if let Some(photo) = analyze_photo(&path, &filename, &existing_photos, refresh_kind) {
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

pub async fn compute_missing_phashes_bg(app: AppHandle) -> Result<(), String> {
    let mut conn = open_alpheratz_connection()?;
    let rows: Vec<(String, String)> = {
        let mut stmt = conn
            .prepare("SELECT photo_filename, photo_path FROM photos WHERE phash IS NULL")
            .map_err(|e| scan_err("Failed to prepare pHash select", e))?;

        let mapped_rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| scan_err("Failed to execute pHash select", e))?;

        mapped_rows
            .filter_map(|row| warn_row_error(row, "phash row decode failed"))
            .collect()
    };

    if rows.is_empty() {
        emit_warn(&app, "scan:enrich_completed", ());
        return Ok(());
    }

    emit_warn(&app, "scan:enrich_start", rows.len());
    emit_warn(
        &app,
        "scan:enrich_progress",
        ScanProgress {
            processed: 0,
            total: rows.len(),
            current_world: "補足情報を準備しています".into(),
            phase: "enrich".into(),
        },
    );
    let mut update_batch: Vec<(String, String)> = Vec::with_capacity(PHASH_BATCH_SIZE);
    let total = rows.len();

    for (index, (filename, path_str)) in rows.into_iter().enumerate() {
        if app.state::<ScanCancelStatus>().0.load(Ordering::SeqCst) {
            crate::utils::log_warn("Background pHash generation cancelled.");
            break;
        }

        let path = PathBuf::from(path_str);
        let computed = tauri::async_runtime::spawn_blocking(move || compute_phash(&path))
            .await
            .map_err(|e| format!("pHash task join error: {}", e))?;

        match computed {
            Some(phash) => {
                update_batch.push((phash, filename.clone()));
                if update_batch.len() >= PHASH_BATCH_SIZE {
                    apply_phash_updates(&mut conn, &update_batch)?;
                    update_batch.clear();
                }
            }
            None => {
                crate::utils::log_warn("Failed to compute pHash in background task");
            }
        }

        if index % 10 == 0 || index == total.saturating_sub(1) {
            emit_warn(
                &app,
                "scan:enrich_progress",
                ScanProgress {
                    processed: index + 1,
                    total,
                    current_world: format!("補足情報を更新中: {}", filename),
                    phase: "enrich".into(),
                },
            );
        }
    }

    if !update_batch.is_empty() {
        apply_phash_updates(&mut conn, &update_batch)?;
    }

    emit_warn(&app, "scan:enrich_completed", ());
    Ok(())
}

fn default_photo_dir() -> Option<PathBuf> {
    let user_dirs = directories::UserDirs::new()?;
    Some(user_dirs.picture_dir()?.join("VRChat"))
}

fn get_existing_photos(conn: &Connection) -> Result<HashMap<String, ExistingPhotoInfo>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT photo_filename, photo_path, world_id, world_name, timestamp, width, height, orientation, phash, histogram
             FROM photos",
        )
        .map_err(|e| scan_err("Failed to prepare existing photo query", e))?;
    let rows = stmt
        .query_map([], |row| {
            let histogram_blob: Option<Vec<u8>> = row.get(9)?;
            Ok(ExistingPhotoInfo {
                photo_filename: row.get(0)?,
                photo_path: row.get(1)?,
                world_id: row.get(2)?,
                world_name: row.get(3)?,
                timestamp: row.get(4)?,
                width: row.get::<_, Option<i64>>(5)?.map(|value| value as u32),
                height: row.get::<_, Option<i64>>(6)?.map(|value| value as u32),
                orientation: row.get(7)?,
                phash: row.get(8)?,
                histogram: histogram_blob
                    .as_deref()
                    .and_then(|bytes| serde_json::from_slice::<Vec<f32>>(bytes).ok()),
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
) -> Option<ScanPhotoData> {
    let captures = RE_PARSE.captures(filename)?;
    let timestamp = format!("{} {}", &captures[1], captures[2].replace("-", ":"));

    let existing = existing_photos.get(filename);

    let (width, height, orientation, histogram, phash) = match refresh_kind {
        ScanRefreshKind::Full => read_image_features(path)?,
        ScanRefreshKind::MetadataOnly | ScanRefreshKind::PathOnly => {
            let existing = existing?;
            (
                existing.width?,
                existing.height?,
                existing.orientation.clone()?,
                existing.histogram.clone()?,
                existing.phash.clone(),
            )
        }
    };

    let (world_name, world_id, match_source) = match refresh_kind {
        ScanRefreshKind::PathOnly => (
            existing.and_then(|photo| photo.world_name.clone()),
            existing.and_then(|photo| photo.world_id.clone()),
            None,
        ),
        ScanRefreshKind::Full | ScanRefreshKind::MetadataOnly => resolve_world_info(
            filename,
            path,
            &timestamp,
            width,
            height,
            phash.as_deref(),
            existing_photos,
        ),
    };

    Some(ScanPhotoData {
        filename: filename.to_string(),
        path: path.to_path_buf(),
        timestamp,
        world_id,
        world_name,
        width: Some(width),
        height: Some(height),
        orientation: Some(orientation),
        histogram: Some(histogram),
        phash,
        match_source,
    })
}

fn resolve_world_info(
    filename: &str,
    path: &Path,
    timestamp: &str,
    width: u32,
    height: u32,
    phash: Option<&str>,
    existing_photos: &HashMap<String, ExistingPhotoInfo>,
) -> (Option<String>, Option<String>, Option<String>) {
    if filename.to_lowercase().ends_with(".png") {
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

    for existing in existing_photos.values() {
        if existing.photo_filename == filename {
            continue;
        }
        if existing.world_name.is_some()
            && existing.timestamp == timestamp
            && existing.width == Some(width)
            && existing.height == Some(height)
        {
            return (
                existing.world_name.clone(),
                existing.world_id.clone(),
                Some("metadata".to_string()),
            );
        }
    }

    if let Some(phash) = phash {
        let mut best_match: Option<&ExistingPhotoInfo> = None;
        let mut best_distance = u32::MAX;

        for existing in existing_photos.values() {
            let Some(existing_phash) = existing.phash.as_deref() else {
                continue;
            };
            if existing.world_name.is_none() && existing.world_id.is_none() {
                continue;
            }

            if let Some(distance) = phash_distance(phash, existing_phash) {
                if distance <= PHASH_MATCH_THRESHOLD && distance < best_distance {
                    best_distance = distance;
                    best_match = Some(existing);
                }
            }
        }

        if let Some(existing) = best_match {
            return (
                existing.world_name.clone(),
                existing.world_id.clone(),
                Some("phash".to_string()),
            );
        }
    }

    (None, None, None)
}

fn read_image_features(path: &Path) -> Option<(u32, u32, String, Vec<f32>, Option<String>)> {
    let image = match image::open(path) {
        Ok(image) => image,
        Err(err) => {
            crate::utils::log_warn(&format!("Failed to open image [{}]: {}", path.display(), err));
            return None;
        }
    };

    let width = image.width();
    let height = image.height();
    let orientation = if width > height {
        "landscape".to_string()
    } else if height > width {
        "portrait".to_string()
    } else {
        "square".to_string()
    };
    let histogram = compute_histogram(&image);
    let phash = Some(
        image_hasher::HasherConfig::new()
            .to_hasher()
            .hash_image(&image)
            .to_base64(),
    );

    Some((width, height, orientation, histogram, phash))
}

fn compute_histogram(image: &image::DynamicImage) -> Vec<f32> {
    let rgb = image.to_rgb8();
    let mut hue_bins = vec![0f32; HUE_BUCKETS];
    let mut sat_sum = 0f32;
    let mut val_sum = 0f32;
    let mut pixel_count = 0f32;

    for pixel in rgb.pixels() {
        let [r, g, b] = pixel.0;
        let (h, s, v) = rgb_to_hsv(r, g, b);
        let bucket = ((h / 360.0) * HUE_BUCKETS as f32).floor() as usize % HUE_BUCKETS;
        hue_bins[bucket] += 1.0;
        sat_sum += s;
        val_sum += v;
        pixel_count += 1.0;
    }

    if pixel_count == 0.0 {
        return vec![0.0; HUE_BUCKETS + 2];
    }

    for value in &mut hue_bins {
        *value /= pixel_count;
    }
    hue_bins.push(sat_sum / pixel_count);
    hue_bins.push(val_sum / pixel_count);
    hue_bins
}

fn rgb_to_hsv(r: u8, g: u8, b: u8) -> (f32, f32, f32) {
    let rf = r as f32 / 255.0;
    let gf = g as f32 / 255.0;
    let bf = b as f32 / 255.0;

    let max = rf.max(gf.max(bf));
    let min = rf.min(gf.min(bf));
    let delta = max - min;

    let hue = if delta == 0.0 {
        0.0
    } else if max == rf {
        60.0 * (((gf - bf) / delta) % 6.0)
    } else if max == gf {
        60.0 * (((bf - rf) / delta) + 2.0)
    } else {
        60.0 * (((rf - gf) / delta) + 4.0)
    };

    let hue = if hue < 0.0 { hue + 360.0 } else { hue };
    let saturation = if max == 0.0 { 0.0 } else { delta / max };
    (hue, saturation, max)
}

fn compute_phash(path: &Path) -> Option<String> {
    image::open(path).ok().map(|image| {
        image_hasher::HasherConfig::new()
            .to_hasher()
            .hash_image(&image)
            .to_base64()
    })
}

fn phash_distance(left: &str, right: &str) -> Option<u32> {
    use base64::Engine as _;

    let left_bytes = base64::engine::general_purpose::STANDARD
        .decode(left)
        .ok()?;
    let right_bytes = base64::engine::general_purpose::STANDARD
        .decode(right)
        .ok()?;

    let mut distance = 0u32;
    for (lhs, rhs) in left_bytes.iter().zip(right_bytes.iter()) {
        distance += (lhs ^ rhs).count_ones();
    }

    Some(distance)
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
                    width,
                    height,
                    orientation,
                    histogram,
                    phash,
                    match_source
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
                ON CONFLICT(photo_filename) DO UPDATE SET
                    photo_path = excluded.photo_path,
                    world_id = COALESCE(excluded.world_id, photos.world_id),
                    world_name = COALESCE(excluded.world_name, photos.world_name),
                    timestamp = excluded.timestamp,
                    width = COALESCE(excluded.width, photos.width),
                    height = COALESCE(excluded.height, photos.height),
                    orientation = COALESCE(excluded.orientation, photos.orientation),
                    histogram = COALESCE(excluded.histogram, photos.histogram),
                    phash = COALESCE(excluded.phash, photos.phash),
                    match_source = COALESCE(excluded.match_source, photos.match_source)",
            )
            .map_err(|e| format!("Failed to prepare insert statement: {}", e))?;

        for item in items {
            let histogram_blob = item
                .histogram
                .as_ref()
                .and_then(|histogram| serde_json::to_vec(histogram).ok());
            stmt.execute(params![
                item.filename,
                item.path.to_slash_lossy().to_string(),
                item.world_id,
                item.world_name,
                item.timestamp,
                item.width.map(|value| value as i64),
                item.height.map(|value| value as i64),
                item.orientation,
                histogram_blob,
                item.phash,
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

fn apply_phash_updates(conn: &mut Connection, updates: &[(String, String)]) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start pHash transaction: {}", e))?;
    {
        let mut stmt = tx
            .prepare("UPDATE photos SET phash = ?1 WHERE photo_filename = ?2")
            .map_err(|e| format!("Failed to prepare pHash update statement: {}", e))?;
        for (phash, filename) in updates {
            stmt.execute(params![phash, filename])
                .map_err(|e| format!("Failed to update pHash for {}: {}", filename, e))?;
        }
    }
    tx.commit()
        .map_err(|e| format!("Failed to commit pHash transaction: {}", e))?;
    Ok(())
}
