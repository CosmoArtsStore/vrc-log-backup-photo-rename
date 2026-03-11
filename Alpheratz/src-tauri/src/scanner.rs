use std::fs;
use std::io::{Read, Seek, SeekFrom, BufReader};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use regex::Regex;
use rusqlite::{params, Connection, OpenFlags};
use tauri::{AppHandle, Emitter, Manager};
use std::sync::atomic::Ordering;

use crate::models::ScanProgress;
use crate::db::{get_alpheratz_db_path, get_stellarecord_db_path};
use crate::config::load_setting;
use crate::ScanCancelStatus;

/// スキャン処理のメインエントリーポイント
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
            let _ = app.emit("scan:error", "写真フォルダが見つかりません。設定から写真フォルダを選択してください。");
            return Err("Folder not found".into());
        }
    };

    let conn = Connection::open(get_alpheratz_db_path().ok_or_else(|| "Failed to get DB path".to_string())?).map_err(|e| e.to_string())?;
    let cancel_status = app.state::<ScanCancelStatus>();

    // 0. 初期ステータス通知 (数千枚の場合、収集フェーズが数秒かかるため)
    let _ = app.emit("scan:progress", ScanProgress { processed: 0, total: 0, current_world: "ファイル収集中...".into() });

    // 1. 既存ファイルを DB から取得 (差分判定用)
    let existing_files = get_existing_filenames(&conn)?;

    // 2. ローカルファイルの再帰的収集 (最適化: Regex を事前にコンパイル)
    let re_collect = Regex::new(r"(?i)VRChat_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.\d{3}.*?\.(png|jpg|jpeg)").unwrap();
    let mut found_files = Vec::new();
    collect_photos_recursive(&photo_dir, &mut found_files, &re_collect, &cancel_status);
    
    if cancel_status.0.load(Ordering::SeqCst) {
        crate::utils::log_warn("Scan cancelled during collection.");
        let _ = app.emit("scan:error", "スキャンが中断されました。");
        return Ok(());
    }
    
    // 3. 新規ファイルのみを抽出して新着順（ファイル名降順）にソート
    let mut new_files: Vec<(String, PathBuf)> = found_files.into_iter()
        .filter(|(name, _)| !existing_files.contains(name))
        .collect();
    new_files.sort_by(|a, b| b.0.cmp(&a.0));

    let total = new_files.len();
    let _ = app.emit("scan:progress", ScanProgress { processed: 0, total, current_world: format!("{} 件の新規ファイルを検出", total) });

    // StellaRecord DB 接続 (読み取り専用)
    let plan_conn = get_stellarecord_db_path()
        .and_then(|p| if p.exists() { Connection::open_with_flags(p, OpenFlags::SQLITE_OPEN_READ_ONLY).ok() } else { None });
    let re_parse = Regex::new(r"VRChat_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.(\d{3})").unwrap();

    if total > 0 {
        let _ = app.emit("scan:progress", ScanProgress { processed: 0, total, current_world: "".into() });

        // 5. 新規ファイルの同期ループ
        for (i, (filename, path)) in new_files.into_iter().enumerate() {
            if cancel_status.0.load(Ordering::SeqCst) {
                crate::utils::log_warn("Scan cancelled by user.");
                let _ = app.emit("scan:error", "スキャンが中断されました。");
                return Ok(());
            }

            if let Some(caps) = re_parse.captures(&filename) {
                let timestamp = format!("{} {}", &caps[1], caps[2].replace("-", ":"));
                
                // ワールド情報の特定: PNG XMPメタデータ → Planetarium DB の優先順
                let (world_name, world_id) = resolve_world_info(&filename, &path, &plan_conn, &timestamp);
                
                // pHashの計算は重いので、スキャンの高速化のためここでは一旦NULLで登録し、後でバックグラウンド実行する
                upsert_photo(&conn, &filename, &path, world_id, world_name.clone(), &timestamp, None)?;

                if i % 10 == 0 || i == total - 1 {
                    // INFOレベルのログは記録しない
                    let _ = app.emit("scan:progress", ScanProgress { 
                        processed: i + 1, 
                        total, 
                        current_world: world_name.unwrap_or_else(|| "ワールド不明".to_string())
                    });
                }
            }
        }
    }

    // 6. 既存のワールド未特定写真をPNGメタデータで遡及更新
    let updated = backfill_missing_world_info(&conn, &plan_conn, &re_parse)?;
    if updated > 0 {
        // INFOレベルのログは記録しない
    }

    // INFOレベルのログは記録しない
    let _ = app.emit("scan:completed", ());
    Ok(())
}

/// バックグラウンドで順次pHashを計算してDBを埋める
pub async fn compute_missing_phashes_bg(app: AppHandle) -> Result<(), String> {
    let db_path = get_alpheratz_db_path().ok_or_else(|| "Failed to get DB path".to_string())?;
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare("SELECT photo_filename, photo_path FROM photos WHERE phash IS NULL").map_err(|e| e.to_string())?;
    let rows: Vec<(String, String)> = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    if rows.is_empty() { return Ok(()); }
    
    // INFOレベルのログは記録しない

    // UIにバックグラウンドのpHash解析が始まったことを伝える（控えめに表示するため）
    let _ = app.emit("scan:phash_start", rows.len());

    let hasher = image_hasher::HasherConfig::new().to_hasher();

    for (i, (filename, path_str)) in rows.into_iter().enumerate() {
        if app.state::<ScanCancelStatus>().0.load(Ordering::SeqCst) {
            crate::utils::log_warn("Background pHash generation cancelled.");
            break;
        }

        let path = Path::new(&path_str);
        if let Ok(img) = image::open(&path) {
            let phash = hasher.hash_image(&img).to_base64();
            let _ = conn.execute(
                "UPDATE photos SET phash = ?1 WHERE photo_filename = ?2",
                rusqlite::params![phash, filename],
            );
        } else {
            // 読み込みに失敗した場合も「失敗済み」として何か入れてスキップさせた方が良いが、
            // 今回はとりあえずそのまま（次回起動再トライ）にする
        }

        if i > 0 && i % 25 == 0 {
            // INFOレベルのログは記録しない
        }
    }
    
    // INFOレベルのログは記録しない
    let _ = app.emit("scan:completed", ()); // 最後にUIに完全リロードさせる
    Ok(())
}

fn default_photo_dir() -> Option<PathBuf> {
    let p = std::env::var("USERPROFILE").ok()?;
    Some(Path::new(&p).join("Pictures").join("VRChat"))
}

fn get_existing_filenames(conn: &Connection) -> Result<HashSet<String>, String> {
    let mut stmt = conn.prepare("SELECT photo_filename FROM photos").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
    let mut set = HashSet::new();
    for r in rows {
        if let Ok(filename) = r { set.insert(filename); }
    }
    Ok(set)
}

fn lookup_world_at_time(plan_conn: &Option<Connection>, timestamp: &str) -> (Option<String>, Option<String>) {
    if let Some(ref pconn) = plan_conn {
        let res: Option<(String, String)> = pconn.query_row(
            "SELECT world_name, world_id FROM world_visits 
                WHERE join_time <= ?1 AND (leave_time IS NULL OR leave_time >= ?1)
                ORDER BY join_time DESC LIMIT 1",
            params![timestamp],
            |row| Ok((row.get(0)?, row.get(1)?))
        ).ok();
        if let Some((wn, wid)) = res {
            return (Some(wn), Some(wid));
        }
    }
    (None, None)
}

/// PNG XMPメタデータ → Planetarium DB の優先順でワールド情報を解決する
fn resolve_world_info(filename: &str, path: &Path, plan_conn: &Option<Connection>, timestamp: &str) -> (Option<String>, Option<String>) {
    if filename.to_lowercase().ends_with(".png") {
        let (name, id) = extract_vrc_metadata_from_png(path);
        if name.is_some() || id.is_some() {
            return (name, id);
        }
    }
    lookup_world_at_time(plan_conn, timestamp)
}

fn upsert_photo(conn: &Connection, filename: &str, path: &Path, world_id: Option<String>, world_name: Option<String>, timestamp: &str, phash: Option<String>) -> Result<(), String> {
    let path_str = path.to_string_lossy().to_string().replace("\\", "/");
    conn.execute(
        "INSERT OR IGNORE INTO photos (photo_filename, photo_path, world_id, world_name, timestamp, phash)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![filename, path_str, world_id, world_name, timestamp, phash]
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// DB上のワールド未特定 (world_id IS NULL) の写真を PNG メタデータで遡及更新する
fn backfill_missing_world_info(conn: &Connection, plan_conn: &Option<Connection>, _re_parse: &Regex) -> Result<usize, String> {
    let mut stmt = conn.prepare(
        "SELECT photo_filename, photo_path, timestamp FROM photos WHERE world_id IS NULL"
    ).map_err(|e| e.to_string())?;

    let rows: Vec<(String, String, String)> = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?))
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    let count = rows.len();
    if count == 0 { return Ok(0); }
    if count == 0 { return Ok(0); }

    let mut updated = 0usize;
    for (filename, path_str, timestamp) in &rows {
        let path = Path::new(path_str);
        let (world_name, world_id) = resolve_world_info(filename, path, plan_conn, timestamp);

        if world_name.is_some() || world_id.is_some() {
            conn.execute(
                "UPDATE photos SET world_id = ?1, world_name = ?2 WHERE photo_filename = ?3",
                params![world_id, world_name, filename],
            ).map_err(|e| e.to_string())?;
            updated += 1;
        }
    }
    Ok(updated)
}

/// PNG iTXt チャンクから VRChat XMP メタデータ (WorldID, WorldDisplayName) を抽出する。
/// IDAT 到達前にヘッダ付近のみ読むため、大きな画像でも高速。
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

    loop {
        let mut header = [0u8; 8];
        if reader.read_exact(&mut header).is_err() {
            break;
        }
        let chunk_len = u32::from_be_bytes([header[0], header[1], header[2], header[3]]) as usize;
        let chunk_type = [header[4], header[5], header[6], header[7]];

        if &chunk_type == b"iTXt" {
            // 不正なPNGによる過大なメモリ確保(OOM)を防ぐため、4MB超のチャンクはスキップ
            const MAX_ITXT_SIZE: usize = 4 * 1024 * 1024;
            if chunk_len > MAX_ITXT_SIZE {
                let _ = reader.seek(SeekFrom::Current(chunk_len as i64 + 4)); // data + CRC
                continue;
            }
            let mut chunk_data = vec![0u8; chunk_len];
            if reader.read_exact(&mut chunk_data).is_err() {
                crate::utils::log_err("[PNG parse] Failed to read iTXt chunk data");
                break;
            }
            if let Some(null_pos) = chunk_data.iter().position(|&b| b == 0) {
                let keyword = String::from_utf8_lossy(&chunk_data[..null_pos]);
                if keyword == "XML:com.adobe.xmp" {
                    let mut pos = null_pos + 1;
                    if pos + 2 <= chunk_data.len() {
                        pos += 2; // compression flag + method
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
            let _ = reader.seek(SeekFrom::Current(4)); // CRC
        } else if &chunk_type == b"IDAT" || &chunk_type == b"IEND" {
            break;
        } else {
            let _ = reader.seek(SeekFrom::Current(chunk_len as i64 + 4));
        }
    }

    (None, None)
}

fn parse_vrc_from_xmp(xmp: &str) -> (Option<String>, Option<String>) {
    let re_id = Regex::new(r"<vrc:WorldID>([^<]+)</vrc:WorldID>").unwrap();
    let re_name = Regex::new(r"<vrc:WorldDisplayName>([^<]+)</vrc:WorldDisplayName>").unwrap();

    let world_id = re_id.captures(xmp).map(|c| c[1].to_string());
    let world_name = re_name.captures(xmp).map(|c| c[1].to_string());

    (world_name, world_id)
}

fn collect_photos_recursive(dir: &Path, files: &mut Vec<(String, PathBuf)>, re: &Regex, cancel_status: &ScanCancelStatus) {
    if cancel_status.0.load(Ordering::SeqCst) {
        return;
    }

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            
            // ジャンクション・シンボリックリンクの回避 (無限ループ防止)
            if let Ok(meta) = fs::symlink_metadata(&path) {
                if meta.file_type().is_symlink() {
                    continue;
                }
            }

            if path.is_dir() {
                // 除外ディレクトリ (隠しフォルダ、開発ツール、巨大キャッシュ、システム関係)
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    let n_low = name.to_lowercase();
                    if name.starts_with('.') || n_low == "node_modules" || n_low == "vendor" || n_low == "cache" 
                       || n_low == "$recycle.bin" || n_low == "system volume information" {
                        continue;
                    }
                }
                collect_photos_recursive(&path, files, re, cancel_status);
                if cancel_status.0.load(Ordering::SeqCst) { return; }
            } else if path.is_file() {
                if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
                    if filename.to_lowercase().starts_with("vrchat_") {
                        if re.is_match(filename) {
                            files.push((filename.to_string(), path.to_path_buf()));
                            if files.len() % 1000 == 0 {
                                // INFOレベルのログは記録しない
                            }
                        }
                    }
                }
            }
        }
    }
}
