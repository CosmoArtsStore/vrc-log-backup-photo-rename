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
    image_width: Option<i64>,
    image_height: Option<i64>,
    source_slot: i64,
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
    image_width: Option<i64>,
    image_height: Option<i64>,
    source_slot: i64,
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
            crate::utils::log_err(&format!("正規表現の初期化に失敗しました [{name}]: {err}"));
            // フォールバックは絶対に一致しない固定値で、継続中のスキャンを安全側に倒す。
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

fn resolve_photo_dirs() -> Result<Vec<(i64, PathBuf)>, PhotoDirErrorKind> {
    let setting = load_setting();
    if setting.photo_folder_path.is_empty() && setting.secondary_photo_folder_path.is_empty() {
        return match default_photo_dir() {
            Some(path) if path.exists() => Ok(vec![(1, path)]),
            Some(path) => Err(PhotoDirErrorKind::Missing(path)),
            None => Err(PhotoDirErrorKind::NotConfigured),
        };
    }

    let mut photo_dirs = Vec::new();

    if !setting.photo_folder_path.is_empty() {
        let configured_path = PathBuf::from(&setting.photo_folder_path);
        if !configured_path.exists() {
            return Err(PhotoDirErrorKind::Missing(configured_path));
        }
        photo_dirs.push((1, configured_path));
    }

    if !setting.secondary_photo_folder_path.is_empty() {
        let configured_path = PathBuf::from(&setting.secondary_photo_folder_path);
        if !configured_path.exists() {
            return Err(PhotoDirErrorKind::Missing(configured_path));
        }
        if !photo_dirs
            .iter()
            .any(|(_, existing_path)| existing_path == &configured_path)
        {
            photo_dirs.push((2, configured_path));
        }
    }

    if photo_dirs.is_empty() {
        Err(PhotoDirErrorKind::NotConfigured)
    } else {
        Ok(photo_dirs)
    }
}

pub async fn do_scan(app: AppHandle) -> Result<(), String> {
    let photo_dirs = match resolve_photo_dirs() {
        Ok(paths) => paths,
        Err(PhotoDirErrorKind::NotConfigured) => {
            let message = "写真フォルダが未設定です。設定から参照フォルダを選択してください。";
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

    let mut conn = open_alpheratz_connection(1)?;
    let cancel_status = app.state::<ScanCancelStatus>();
    emit_warn(
        &app,
        "scan:progress",
        ScanProgress {
            processed: 0,
            total: 0,
            current_world: "ファイルを収集中...".into(),
            phase: "scan".into(),
        },
    );

    let existing_photos = get_existing_photos(&conn)?;
    let mut found_files = Vec::new();
    for (source_slot, photo_dir) in &photo_dirs {
        collect_photos_recursive(*source_slot, photo_dir, &mut found_files, &cancel_status);
    }

    if cancel_status.0.load(Ordering::SeqCst) {
        crate::utils::log_warn("ファイル収集中にスキャンが中断されました。");
        emit_warn(&app, "scan:error", "スキャンを中断しました");
        return Ok(());
    }

    let found_path_set: HashSet<String> = found_files
        .iter()
        .map(|(_, _, path)| path.to_slash_lossy().to_string())
        .collect();
    mark_missing_photos(&conn, &existing_photos, &found_path_set)?;

    let candidate_files: Vec<(String, PathBuf, i64, ScanRefreshKind)> = found_files
        .into_iter()
        .filter_map(|(slot, filename, path)| {
            let normalized_path = path.to_slash_lossy().to_string();
            match existing_photos.get(&normalized_path) {
                None => Some((filename, path, slot, ScanRefreshKind::Full)),
                Some(existing) => {
                    let filename_changed = existing.photo_filename != filename;
                    let missing_features = false;
                    let missing_world =
                        existing.world_name.is_none() && existing.world_id.is_none();
                    let reappeared = existing.is_missing;
                    let source_changed = existing.source_slot != slot;

                    if reappeared || missing_features || source_changed {
                        Some((filename, path, slot, ScanRefreshKind::Full))
                    } else if filename_changed {
                        Some((filename, path, slot, ScanRefreshKind::PathOnly))
                    } else if missing_world && filename.to_ascii_lowercase().ends_with(".png") {
                        Some((filename, path, slot, ScanRefreshKind::MetadataOnly))
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
            current_world: format!("{} 件の更新対象を確認しました", total),
            phase: "scan".into(),
        },
    );

    for (index, (filename, path, source_slot, refresh_kind)) in
        candidate_files.into_iter().enumerate()
    {
        if cancel_status.0.load(Ordering::SeqCst) {
            crate::utils::log_warn("ユーザー操作でスキャンが中断されました。");
            emit_warn(&app, "scan:error", "スキャンを中断しました");
            return Ok(());
        }

        if let Some(photo) = analyze_photo(
            &path,
            &filename,
            source_slot,
            &existing_photos,
            refresh_kind,
        )? {
            let current_world = photo
                .world_name
                .clone()
                .unwrap_or_else(|| "ワールド不明".to_string());
            upsert_photo_batch(&mut conn, &[photo])?;

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
            "SELECT photo_filename, photo_path, world_id, world_name, timestamp, orientation, image_width, image_height, source_slot, is_missing
             FROM photos",
        )
        .map_err(|e| scan_err("既存写真一覧クエリを準備できません", e))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ExistingPhotoInfo {
                photo_filename: row.get(0)?,
                photo_path: row.get(1)?,
                world_id: row.get(2)?,
                world_name: row.get(3)?,
                orientation: row.get(5)?,
                image_width: row.get(6)?,
                image_height: row.get(7)?,
                source_slot: row.get(8)?,
                is_missing: row.get::<_, i64>(9)? != 0,
            })
        })
        .map_err(|e| scan_err("既存写真一覧クエリを実行できません", e))?;

    let mut map = HashMap::new();
    for row in rows {
        if let Some(info) = warn_row_error(row, "既存写真行の読み取りに失敗しました")
        {
            map.insert(info.photo_path.clone(), info);
        }
    }

    Ok(map)
}

fn analyze_photo(
    path: &Path,
    filename: &str,
    source_slot: i64,
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
        ScanRefreshKind::Full | ScanRefreshKind::MetadataOnly => resolve_world_info_lightweight(
            &normalized_path,
            filename,
            path,
            &timestamp,
            existing_photos,
        ),
    };
    let (orientation, image_width, image_height) = match refresh_kind {
        ScanRefreshKind::PathOnly => (
            existing.and_then(|photo| photo.orientation.clone()),
            existing.and_then(|photo| photo.image_width),
            existing.and_then(|photo| photo.image_height),
        ),
        ScanRefreshKind::Full | ScanRefreshKind::MetadataOnly => {
            let dimensions = match image::image_dimensions(path) {
                Ok(value) => Some(value),
                Err(err) => {
                    crate::utils::log_warn(&format!(
                        "画像サイズを取得できなかったため unknown として扱います [{}]: {}",
                        path.display(),
                        err
                    ));
                    None
                }
            };
            let orientation = dimensions
                .map(|(width, height)| {
                    if height > width {
                        "portrait"
                    } else {
                        "landscape"
                    }
                    .to_string()
                })
                .or_else(|| Some("unknown".to_string()));
            let image_width = dimensions.map(|(width, _)| i64::from(width));
            let image_height = dimensions.map(|(_, height)| i64::from(height));
            (orientation, image_width, image_height)
        }
    };

    Ok(Some(ScanPhotoData {
        filename: filename.to_string(),
        path: path.to_path_buf(),
        timestamp,
        world_id,
        world_name,
        orientation,
        image_width,
        image_height,
        source_slot,
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
        return Ok(format!(
            "{} {}",
            &captures[1],
            captures[2].replace("-", ":")
        ));
    }

    let metadata = fs::metadata(path).map_err(|err| {
        scan_err(
            &format!("ファイルメタデータを取得できません [{}]", path.display()),
            err,
        )
    })?;
    let modified = metadata.modified().map_err(|err| {
        scan_err(
            &format!("更新日時を取得できません [{}]", path.display()),
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
                "STELLA RECORD DB を開けないためワールド補完をスキップします ({}): {}",
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
        .map_err(|e| scan_err("欠損写真の反映トランザクションを開始できません", e))?;
    {
        let mut mark_missing = tx
            .prepare("UPDATE photos SET is_missing = 1 WHERE photo_path = ?1")
            .map_err(|e| scan_err("欠損写真更新ステートメントを準備できません", e))?;

        for photo_path in missing {
            mark_missing
                .execute(params![photo_path])
                .map_err(|e| scan_err("欠損写真を更新できません", e))?;
        }
    }
    tx.commit()
        .map_err(|e| scan_err("欠損写真の反映を確定できません", e))?;
    Ok(())
}

fn upsert_photo_batch(conn: &mut Connection, items: &[ScanPhotoData]) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|e| format!("写真更新トランザクションを開始できません: {}", e))?;
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
                    image_width,
                    image_height,
                    source_slot,
                    match_source,
                    is_missing
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0)
                ON CONFLICT(photo_path) DO UPDATE SET
                    photo_filename = excluded.photo_filename,
                    world_id = COALESCE(excluded.world_id, photos.world_id),
                    world_name = COALESCE(excluded.world_name, photos.world_name),
                    timestamp = excluded.timestamp,
                    orientation = COALESCE(excluded.orientation, photos.orientation),
                    image_width = COALESCE(excluded.image_width, photos.image_width),
                    image_height = COALESCE(excluded.image_height, photos.image_height),
                    source_slot = excluded.source_slot,
                    match_source = COALESCE(excluded.match_source, photos.match_source),
                    is_missing = 0",
            )
            .map_err(|e| format!("写真更新ステートメントを準備できません: {}", e))?;

        for item in items {
            stmt.execute(params![
                item.path.to_slash_lossy().to_string(),
                item.filename,
                item.world_id,
                item.world_name,
                item.timestamp,
                item.orientation,
                item.image_width,
                item.image_height,
                item.source_slot,
                item.match_source,
            ])
            .map_err(|e| format!("写真を更新できません [{}]: {}", item.filename, e))?;
        }
    }
    tx.commit()
        .map_err(|e| format!("写真更新トランザクションを確定できません: {}", e))?;
    Ok(())
}

fn extract_vrc_metadata_from_png(path: &Path) -> (Option<String>, Option<String>) {
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(err) => {
            crate::utils::log_err(&format!(
                "PNG メタデータ解析用にファイルを開けません [{}]: {}",
                path.display(),
                err
            ));
            return (None, None);
        }
    };

    let mut reader = BufReader::new(file);
    let mut sig = [0u8; 8];
    if reader.read_exact(&mut sig).is_err() || sig != *b"\x89PNG\r\n\x1a\n" {
        crate::utils::log_warn(&format!(
            "PNG シグネチャが不正なためメタデータ解析をスキップします [{}]",
            path.display()
        ));
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
                        "大きすぎる iTXt をスキップできませんでした [{}]: {}",
                        path.display(),
                        err
                    ));
                    break;
                }
                continue;
            }
            chunk_data.clear();
            chunk_data.resize(chunk_len, 0u8);
            if reader.read_exact(&mut chunk_data).is_err() {
                crate::utils::log_err(&format!(
                    "iTXt チャンクを読み取れませんでした [{}]",
                    path.display()
                ));
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
                    "iTXt CRC をスキップできませんでした [{}]: {}",
                    path.display(),
                    err
                ));
                break;
            }
        } else if &chunk_type == b"IDAT" || &chunk_type == b"IEND" {
            break;
        } else if let Err(err) = reader.seek(SeekFrom::Current(chunk_len as i64 + 4)) {
            crate::utils::log_warn(&format!(
                "PNG チャンクをスキップできませんでした [{}]: {}",
                path.display(),
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
    source_slot: i64,
    dir: &Path,
    files: &mut Vec<(i64, String, PathBuf)>,
    cancel_status: &ScanCancelStatus,
) {
    if cancel_status.0.load(Ordering::SeqCst) {
        return;
    }

    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(err) => {
            crate::utils::log_warn(&format!(
                "ディレクトリを読み取れないため走査をスキップします [{}]: {}",
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
                    "ディレクトリエントリの読み取りに失敗しました [{}]: {}",
                    dir.display(),
                    err
                ));
                continue;
            }
        };

        let path = entry.path();
        match fs::symlink_metadata(&path) {
            Ok(meta) => {
                if meta.file_type().is_symlink() {
                    continue;
                }
            }
            Err(err) => {
                crate::utils::log_warn(&format!(
                    "シンボリックリンク情報を取得できませんでした [{}]: {}",
                    path.display(),
                    err
                ));
            }
        }

        if path.is_dir() {
            if let Some(name) = path.file_name().and_then(|value| value.to_str()) {
                let name_lower = name.to_lowercase();
                if name.starts_with('.') || SKIP_DIRS.contains(&name_lower.as_str()) {
                    continue;
                }
            }
            collect_photos_recursive(source_slot, &path, files, cancel_status);
            if cancel_status.0.load(Ordering::SeqCst) {
                return;
            }
        } else if path.is_file() {
            if let Some(filename) = path.file_name().and_then(|value| value.to_str()) {
                if is_supported_image_extension(filename) {
                    files.push((source_slot, filename.to_string(), path.to_path_buf()));
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
