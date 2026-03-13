use std::collections::HashSet;
use std::fs;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use std::sync::atomic::Ordering;

use path_slash::PathExt;
use regex::Regex;
use rusqlite::{Connection, OpenFlags, params};
use tauri::{AppHandle, Emitter, Manager};

use crate::ScanCancelStatus;
use crate::config::load_setting;
use crate::db::{get_alpheratz_db_path, get_stella_record_db_path};
use crate::models::ScanProgress;

const SUPPORTED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp"];
const PHASH_BATCH_SIZE: usize = 50;
const PHOTO_INSERT_BATCH_SIZE: usize = 50;
const MAX_ITXT_SIZE: usize = 4 * 1024 * 1024;
const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "vendor",
    "cache",
    "$recycle.bin",
    "system volume information",
    "thumbnails",
];

fn compile_regex(pattern: &str, name: &str) -> Regex {
    match Regex::new(pattern) {
        Ok(re) => re,
        Err(err) => {
            crate::utils::log_err(&format!("Invalid regex {name}: {err}"));
            Regex::new(r"^$").expect("fallback regex must be valid")
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
    compile_regex(r"VRChat_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.(\d{3})", "RE_PARSE")
});
static RE_ID: LazyLock<Regex> =
    LazyLock::new(|| compile_regex(r"<vrc:WorldID>([^<]+)</vrc:WorldID>", "RE_ID"));
static RE_NAME: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(r"<vrc:WorldDisplayName>([^<]+)</vrc:WorldDisplayName>", "RE_NAME")
});

pub async fn do_scan(app: AppHandle) -> Result<(), String> {
    let setting = load_setting();
    let photo_dir = if setting.photo_folder_path.is_empty() {
        default_photo_dir()
    } else {
        Some(PathBuf::from(&setting.photo_folder_path))
    };

    let photo_dir = match photo_dir {
        Some(p) if p.exists() => p,
        _ => {
            let _ = app.emit("scan:error", "写真フォルダが見つかりません。設定を確認してください。");
            return Err("Folder not found".into());
        }
    };

    let mut conn = Connection::open(
        get_alpheratz_db_path().ok_or_else(|| "Failed to get DB path".to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let cancel_status = app.state::<ScanCancelStatus>();
    let _ = app.emit(
        "scan:progress",
        ScanProgress {
            processed: 0,
            total: 0,
            current_world: "ファイル収集中...".into(),
        },
    );

    let existing_files = get_existing_filenames(&conn)?;
    let mut found_files = Vec::new();
    collect_photos_recursive(&photo_dir, &mut found_files, &RE_COLLECT, &cancel_status);

    if cancel_status.0.load(Ordering::SeqCst) {
        crate::utils::log_warn("Scan cancelled during collection.");
        let _ = app.emit("scan:error", "スキャンが中断されました。");
        return Ok(());
    }

    let mut new_files: Vec<(String, PathBuf)> = found_files
        .into_iter()
        .filter(|(name, _)| !existing_files.contains(name))
        .collect();
    new_files.sort_by(|a, b| b.0.cmp(&a.0));

    let total = new_files.len();
    let _ = app.emit(
        "scan:progress",
        ScanProgress {
            processed: 0,
            total,
            current_world: format!("{} 件の新規ファイルを処理", total),
        },
    );

    let plan_conn = match get_stella_record_db_path() {
        Some(path) if path.exists() => {
            match Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY) {
                Ok(conn) => Some(conn),
                Err(err) => {
                    crate::utils::log_warn(&format!(
                        "Failed to open STELLA RECORD DB ({}): {}",
                        path.display(),
                        err
                    ));
                    None
                }
            }
        }
        Some(path) => {
            crate::utils::log_warn(&format!("STELLA RECORD DB not found: {}", path.display()));
            None
        }
        None => None,
    };

    if total > 0 {
        let mut insert_batch: Vec<(String, PathBuf, Option<String>, Option<String>, String, Option<String>)> =
            Vec::with_capacity(PHOTO_INSERT_BATCH_SIZE);

        for (i, (filename, path)) in new_files.into_iter().enumerate() {
            if cancel_status.0.load(Ordering::SeqCst) {
                crate::utils::log_warn("Scan cancelled by user.");
                let _ = app.emit("scan:error", "スキャンが中断されました。");
                return Ok(());
            }

            if let Some(caps) = RE_PARSE.captures(&filename) {
                let timestamp = format!("{} {}", &caps[1], caps[2].replace("-", ":"));
                let (world_name, world_id) = resolve_world_info(&filename, &path, &plan_conn, &timestamp);
                let current_world = world_name.clone().unwrap_or_else(|| "ワールド不明".to_string());
                insert_batch.push((filename, path, world_id, world_name, timestamp, None));

                if insert_batch.len() >= PHOTO_INSERT_BATCH_SIZE {
                    upsert_photo_batch(&mut conn, &insert_batch)?;
                    insert_batch.clear();
                }

                if i % 10 == 0 || i == total - 1 {
                    let _ = app.emit(
                        "scan:progress",
                        ScanProgress {
                            processed: i + 1,
                            total,
                            current_world,
                        },
                    );
                }
            }
        }

        if !insert_batch.is_empty() {
            upsert_photo_batch(&mut conn, &insert_batch)?;
        }
    }

    let _ = backfill_missing_world_info(&conn, &plan_conn, &RE_PARSE)?;
    let _ = app.emit("scan:completed", ());
    Ok(())
}

pub async fn compute_missing_phashes_bg(app: AppHandle) -> Result<(), String> {
    let db_path = get_alpheratz_db_path().ok_or_else(|| "Failed to get DB path".to_string())?;
    let mut conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT photo_filename, photo_path FROM photos WHERE phash IS NULL")
        .map_err(|e| e.to_string())?;

    let rows: Vec<(String, String)> = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    if rows.is_empty() {
        return Ok(());
    }

    let _ = app.emit("scan:phash_start", rows.len());
    let mut update_batch: Vec<(String, String)> = Vec::with_capacity(PHASH_BATCH_SIZE);

    for (filename, path_str) in rows {
        if app.state::<ScanCancelStatus>().0.load(Ordering::SeqCst) {
            crate::utils::log_warn("Background pHash generation cancelled.");
            break;
        }

        let path = PathBuf::from(path_str);
        let computed = tauri::async_runtime::spawn_blocking(move || {
            let hasher = image_hasher::HasherConfig::new().to_hasher();
            image::open(&path)
                .map(|img| hasher.hash_image(&img).to_base64())
                .map_err(|e| e.to_string())
        })
        .await
        .map_err(|e| format!("pHash task join error: {}", e))?;

        match computed {
            Ok(phash) => {
                update_batch.push((phash, filename));
                if update_batch.len() >= PHASH_BATCH_SIZE {
                    apply_phash_updates(&mut conn, &update_batch)?;
                    update_batch.clear();
                }
            }
            Err(err) => {
                crate::utils::log_warn(&format!("Failed to compute pHash: {}", err));
            }
        }
    }

    if !update_batch.is_empty() {
        apply_phash_updates(&mut conn, &update_batch)?;
    }

    let _ = app.emit("scan:completed", ());
    Ok(())
}

fn default_photo_dir() -> Option<PathBuf> {
    let user_dirs = directories::UserDirs::new()?;
    Some(user_dirs.picture_dir()?.join("VRChat"))
}

fn get_existing_filenames(conn: &Connection) -> Result<HashSet<String>, String> {
    let mut stmt = conn
        .prepare("SELECT photo_filename FROM photos")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    let mut set = HashSet::new();
    for r in rows {
        if let Ok(filename) = r {
            set.insert(filename);
        }
    }
    Ok(set)
}

fn lookup_world_at_time(plan_conn: &Option<Connection>, timestamp: &str) -> (Option<String>, Option<String>) {
    if let Some(ref pconn) = plan_conn {
        let res: Option<(String, String)> = pconn
            .query_row(
                "SELECT world_name, world_id FROM world_visits
                 WHERE join_time <= ?1 AND (leave_time IS NULL OR leave_time >= ?1)
                 ORDER BY join_time DESC LIMIT 1",
                params![timestamp],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();
        if let Some((wn, wid)) = res {
            return (Some(wn), Some(wid));
        }
    }
    (None, None)
}

fn resolve_world_info(
    filename: &str,
    path: &Path,
    plan_conn: &Option<Connection>,
    timestamp: &str,
) -> (Option<String>, Option<String>) {
    if filename.to_lowercase().ends_with(".png") {
        let (name, id) = extract_vrc_metadata_from_png(path);
        if name.is_some() || id.is_some() {
            return (name, id);
        }
    }
    lookup_world_at_time(plan_conn, timestamp)
}

fn upsert_photo_batch(
    conn: &mut Connection,
    items: &[(String, PathBuf, Option<String>, Option<String>, String, Option<String>)],
) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start insert transaction: {}", e))?;
    {
        let mut stmt = tx
            .prepare("INSERT OR IGNORE INTO photos (photo_filename, photo_path, world_id, world_name, timestamp, phash) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
            .map_err(|e| format!("Failed to prepare insert statement: {}", e))?;
        for (filename, path, world_id, world_name, timestamp, phash) in items {
            let path_str = path.to_slash_lossy().to_string();
            stmt.execute(params![filename, path_str, world_id, world_name, timestamp, phash])
                .map_err(|e| format!("Failed to insert photo {}: {}", filename, e))?;
        }
    }
    tx.commit()
        .map_err(|e| format!("Failed to commit insert transaction: {}", e))?;
    Ok(())
}

fn backfill_missing_world_info(
    conn: &Connection,
    plan_conn: &Option<Connection>,
    _re_parse: &Regex,
) -> Result<usize, String> {
    let mut stmt = conn
        .prepare("SELECT photo_filename, photo_path, timestamp FROM photos WHERE world_id IS NULL")
        .map_err(|e| e.to_string())?;

    let rows: Vec<(String, String, String)> = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .collect();

    if rows.is_empty() {
        return Ok(0);
    }

    let mut updated = 0usize;
    for (filename, path_str, timestamp) in &rows {
        let path = Path::new(path_str);
        let (world_name, world_id) = resolve_world_info(filename, path, plan_conn, timestamp);
        if world_name.is_some() || world_id.is_some() {
            conn.execute(
                "UPDATE photos SET world_id = ?1, world_name = ?2 WHERE photo_filename = ?3",
                params![world_id, world_name, filename],
            )
            .map_err(|e| e.to_string())?;
            updated += 1;
        }
    }
    Ok(updated)
}

fn extract_vrc_metadata_from_png(path: &Path) -> (Option<String>, Option<String>) {
    let file = match fs::File::open(path) {
        Ok(f) => f,
        Err(e) => {
            crate::utils::log_err(&format!("[PNG parse] Failed to open {:?}: {}", path, e));
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
                let _ = reader.seek(SeekFrom::Current(chunk_len as i64 + 4));
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
            let _ = reader.seek(SeekFrom::Current(4));
        } else if &chunk_type == b"IDAT" || &chunk_type == b"IEND" {
            break;
        } else {
            let _ = reader.seek(SeekFrom::Current(chunk_len as i64 + 4));
        }
    }

    (None, None)
}

fn parse_vrc_from_xmp(xmp: &str) -> (Option<String>, Option<String>) {
    let world_id = RE_ID
        .captures(xmp)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string());
    let world_name = RE_NAME
        .captures(xmp)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string());
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
            crate::utils::log_warn(&format!("Failed to read directory {}: {}", dir.display(), err));
            return;
        }
    };

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(err) => {
                crate::utils::log_warn(&format!("Failed to read entry in {}: {}", dir.display(), err));
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
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                let n_low = name.to_lowercase();
                if name.starts_with('.') || SKIP_DIRS.contains(&n_low.as_str()) {
                    continue;
                }
            }
            collect_photos_recursive(&path, files, re, cancel_status);
            if cancel_status.0.load(Ordering::SeqCst) {
                return;
            }
        } else if path.is_file() {
            if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
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
        .and_then(|v| v.to_str())
        .map(|v| v.to_ascii_lowercase());
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
