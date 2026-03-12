mod db;
mod parser;

pub use db::init_db;
pub use parser::*;

use chrono::NaiveDateTime;
use rusqlite::{params, Connection, Result};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;

/// アーカイブディレクトリ内の output_log_*.txt を収集（ソート済み）
fn collect_log_files(archive_dir: &Path) -> Vec<std::path::PathBuf> {
    let mut files = Vec::new();
    if !archive_dir.exists() {
        return files;
    }
    if let Ok(entries) = fs::read_dir(archive_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.starts_with("output_log_") && name.ends_with(".txt") {
                        files.push(path);
                    }
                }
            }
        }
    }
    files.sort();
    files
}

/// 差分インポート: 未処理のログのみ DB に取り込む
/// progress_callback は (status, progress) の形式で呼ばれる
pub fn run_diff_import<F>(
    db_path: std::path::PathBuf,
    archive_dir: std::path::PathBuf,
    mut progress_callback: F,
) -> Result<(), String>
where
    F: FnMut(String, String),
{
    let mut conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    
    init_db(&conn)
        .map_err(|e| format!("Failed to init DB: {}", e))?;

    let log_files = collect_log_files(&archive_dir);
    if log_files.is_empty() {
        progress_callback("処理対象ログなし".to_string(), "0%".to_string());
        return Ok(());
    }

    progress_callback(
        format!("{}件のログを処理します", log_files.len()),
        "0%".to_string(),
    );

    let total = log_files.len();
    for (idx, log_path) in log_files.iter().enumerate() {
        let filename = log_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let already_processed: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM app_sessions WHERE log_filename = ?1)",
                params![filename],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if already_processed {
            let progress_pct = ((idx + 1) as f32 / total as f32 * 100.0) as u32;
            progress_callback(
                format!("スキップ（DB登録済み）: {}", filename),
                format!("{}%", progress_pct),
            );
        } else {
            progress_callback(
                format!("処理中: {}", filename),
                format!("{}%", ((idx as f32 / total as f32) * 100.0) as u32),
            );
            if let Err(e) = parse_and_import(&mut conn, log_path, &filename, &mut progress_callback) {
                crate::log_err_lib(&format!("[StellaRecord] エラー ({}): {}", filename, e));
            }
        }
    }

    progress_callback("処理完了".to_string(), "100%".to_string());
    Ok(())
}

fn parse_and_import<F>(
    conn: &mut Connection,
    log_path: &Path,
    filename: &str,
    progress_callback: &mut F,
) -> Result<()>
where
    F: FnMut(String, String),
{
    #[cfg(windows)]
    let file = {
        use std::os::windows::fs::OpenOptionsExt;
        use windows::Win32::Storage::FileSystem::FILE_SHARE_READ;
        fs::OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ.0)
            .open(log_path)
            .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?
    };
    #[cfg(not(windows))]
    let file = fs::File::open(log_path)
        .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;

    parse_and_import_reader(conn, BufReader::new(file), filename, progress_callback)
}

/// BufReader<R> を受け取り実際にパース・インポートを行う汎用関数。
/// .txt ファイルからも tar エントリからも呼び出せる。
fn parse_and_import_reader<R, F>(
    conn: &mut Connection,
    reader: BufReader<R>,
    filename: &str,
    progress_callback: &mut F,
) -> Result<()>
where
    R: std::io::Read,
    F: FnMut(String, String),
{
    let mut start_time: Option<String> = None;
    let mut end_time: Option<String> = None;
    let mut my_user_id: Option<String> = None;
    let mut my_display_name: Option<String> = None;
    let mut vrchat_build: Option<String> = None;
    let mut current_ts: Option<NaiveDateTime> = None;
    let mut current_visit_id: Option<i64> = None;
    let mut pending_room_name: Option<String> = None;

    let tx = conn.transaction()?;

    tx.execute(
        "INSERT OR IGNORE INTO app_sessions (start_time, end_time, my_user_id, my_display_name, vrchat_build, log_filename)
         VALUES ('', NULL, NULL, NULL, NULL, ?1)",
        params![filename],
    )?;
    let session_id: i64 = tx.query_row(
        "SELECT id FROM app_sessions WHERE log_filename = ?1",
        params![filename],
        |row| row.get(0),
    )?;

    // player_id キャッシュ: SELECT id FROM players WHERE user_id = ? を毎行発行しないために使用
    let mut player_id_cache: HashMap<String, i64> = HashMap::new();

    progress_callback("パース開始".to_string(), "0%".to_string());

    let mut line_count = 0;
    for line_result in reader.lines() {
        let line = match line_result {
            Ok(l) => l,
            Err(_) => continue,
        };
        line_count += 1;

        if line_count % 5000 == 0 {
            progress_callback(format!("パース中... {} 行", line_count), "".to_string());
        }

        // --- タイムスタンプ更新 ---
        if let Some(caps) = RE_TIME.captures(&line) {
            let Some(m) = caps.get(1) else { continue; };
            let ts_str = m.as_str();
            if let Ok(dt) = NaiveDateTime::parse_from_str(ts_str, "%Y.%m.%d %H:%M:%S") {
                current_ts = Some(dt);
                let formatted = dt.format("%Y-%m-%d %H:%M:%S").to_string();
                if start_time.is_none() {
                    start_time = Some(formatted.clone());
                }
                end_time = Some(formatted);
            }
        }
        let ts_str = current_ts
            .map(|t| t.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_default();

        // --- VRChatビルド ---
        if vrchat_build.is_none() {
            if let Some(caps) = RE_BUILD.captures(&line) {
                if let Some(m) = caps.get(1) {
                    vrchat_build = Some(m.as_str().trim().to_string());
                }
            }
        }

        // --- ログイン認証（セッション開始時1回のみ） ---
        if let Some(caps) = RE_USER_AUTH.captures(&line) {
            if my_display_name.is_none() {
                if let (Some(m1), Some(m2)) = (caps.get(1), caps.get(2)) {
                    my_display_name = Some(m1.as_str().to_string());
                    my_user_id = Some(m2.as_str().to_string());
                }
            }
            continue;
        }

        // --- ワールド名（Joiningの直前に出現）---
        if let Some(caps) = RE_ENTERING.captures(&line) {
            // 現在のvisitを閉じる
            if let Some(vid) = current_visit_id {
                tx.execute(
                    "UPDATE world_visits SET leave_time = ?1 WHERE id = ?2 AND leave_time IS NULL",
                    params![ts_str, vid],
                )?;
                tx.execute(
                    "UPDATE player_visits SET leave_time = ?1 WHERE visit_id = ?2 AND leave_time IS NULL",
                    params![ts_str, vid],
                )?;
            }
            if let Some(m) = caps.get(1) {
                pending_room_name = Some(m.as_str().to_string());
            }
            current_visit_id = None;
            continue;
        }

        // --- ワールドJoin ---
        if let Some(caps) = RE_JOINING.captures(&line) {
            if let Some(ref rname) = pending_room_name {
                let world_id = caps.get(1).map(|m| m.as_str()).unwrap_or("").to_string();
                // instance_id: インスタンス番号のみ（例: "74156"）
                let instance_id = caps.get(2).map(|m| m.as_str()).unwrap_or("").to_string();
                let access_raw = caps.get(3).map(|m| m.as_str().trim()).unwrap_or("").to_string();
                let region = caps.get(4).map(|m| m.as_str().to_string());
                let (access_type, instance_owner) = parse_access_type(&access_raw);

                tx.execute(
                    "INSERT INTO world_visits
                     (session_id, world_name, world_id, instance_id, access_type, instance_owner, region, join_time)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    params![session_id, rname, world_id, instance_id, access_type, instance_owner, region, ts_str],
                )?;
                current_visit_id = Some(tx.last_insert_rowid());
            }
            continue;
        }

        // --- ルーム退室 ---
        if RE_LEFT_ROOM.is_match(&line) {
            if let Some(vid) = current_visit_id {
                tx.execute(
                    "UPDATE world_visits SET leave_time = ?1 WHERE id = ?2 AND leave_time IS NULL",
                    params![ts_str, vid],
                )?;
                tx.execute(
                    "UPDATE player_visits SET leave_time = ?1 WHERE visit_id = ?2 AND leave_time IS NULL",
                    params![ts_str, vid],
                )?;
                current_visit_id = None;
                pending_room_name = None;
            }
            continue;
        }

        // --- プレイヤー入室 ---
        if let Some(caps) = RE_PLAYER_JOIN.captures(&line) {
            let (Some(m1), Some(m2)) = (caps.get(1), caps.get(2)) else { continue; };
            let dname = m1.as_str().to_string();
            let uid = m2.as_str().to_string();

            tx.execute(
                "INSERT INTO players (user_id, display_name) VALUES (?1, ?2)
                 ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name",
                params![uid, dname],
            )?;

            let player_id = if let Some(&pid) = player_id_cache.get(&uid) {
                Some(pid)
            } else {
                let pid: Option<i64> = tx.query_row(
                    "SELECT id FROM players WHERE user_id = ?1",
                    params![uid],
                    |row| row.get::<_, i64>(0),
                ).ok();
                if let Some(pid) = pid {
                    player_id_cache.insert(uid.clone(), pid);
                }
                pid
            };

            if let (Some(vid), Some(pid)) = (current_visit_id, player_id) {
                tx.execute(
                    "INSERT OR IGNORE INTO player_visits (visit_id, player_id, is_self, join_time)
                     VALUES (?1, ?2, 0, ?3)",
                    params![vid, pid, ts_str],
                )?;
            }
            continue;
        }

        // --- プレイヤー退室 ---
        if let Some(caps) = RE_PLAYER_LEFT.captures(&line) {
            let Some(m2) = caps.get(2) else { continue; };
            let uid = m2.as_str().to_string();
            if let Some(vid) = current_visit_id {
                let player_id = if let Some(&pid) = player_id_cache.get(&uid) {
                    Some(pid)
                } else {
                    tx.query_row(
                        "SELECT id FROM players WHERE user_id = ?1",
                        params![uid],
                        |row| row.get(0),
                    ).ok()
                };
                if let Some(pid) = player_id {
                    tx.execute(
                        "UPDATE player_visits SET leave_time = ?1
                         WHERE visit_id = ?2 AND player_id = ?3 AND leave_time IS NULL",
                        params![ts_str, vid, pid],
                    )?;
                }
            }
            continue;
        }

        // --- ローカルプレイヤー確定（ワールド入室ごとに出現）---
        //   User Authenticated とは別に、ワールド内でのローカル/リモート判定に使う
        if let Some(caps) = RE_IS_LOCAL.captures(&line) {
            let (Some(m1), Some(m2)) = (caps.get(1), caps.get(2)) else { continue; };
            let dname_raw = m1.as_str();
            let locality = m2.as_str();
            if locality == "local" {
                // my_display_name の補完（User Authenticated に頼れないログ形式の場合）
                if my_display_name.is_none() || my_display_name.as_deref() == Some("[LocalPlayer]") {
                    my_display_name = Some(dname_raw.to_string());
                }
                if let Some(vid) = current_visit_id {
                    tx.execute(
                        "UPDATE player_visits SET is_self = 1
                         WHERE visit_id = ?1
                           AND player_id IN (SELECT id FROM players WHERE display_name = ?2)",
                        params![vid, dname_raw],
                    )?;
                }
            }
            continue;
        }

        // --- 動画再生（URLのみ記録）---
        if let Some(caps) = RE_VIDEO.captures(&line) {
            if let Some(vid) = current_visit_id {
                if let Some(m) = caps.get(1) {
                    let url = m.as_str().trim_end_matches(',')
                        .trim().to_string();
                    tx.execute(
                        "INSERT INTO video_playbacks (visit_id, url, timestamp) VALUES (?1, ?2, ?3)",
                        params![vid, url, ts_str],
                    )?;
                }
            }
            continue;
        }

        // --- 動画再生 代替パターン（USharpVideo Started video:）---
        if let Some(caps) = RE_VIDEO_ALT.captures(&line) {
            if let Some(vid) = current_visit_id {
                if let Some(m) = caps.get(1) {
                    let url = m.as_str().to_string();
                    tx.execute(
                        "INSERT INTO video_playbacks (visit_id, url, timestamp) VALUES (?1, ?2, ?3)",
                        params![vid, url, ts_str],
                    )?;
                }
            }
            continue;
        }

        // --- 通知受信（group タイプはスキップ）---
        if let Some(caps) = RE_NOTIFICATION.captures(&line) {
            let Some(m3) = caps.get(3) else { continue; };
            let notif_type = m3.as_str().trim().to_string();
            if !is_collectible_notification(&notif_type) {
                continue;
            }
            let sender_username = caps.get(1).map(|m| m.as_str()).filter(|s| !s.is_empty()).map(String::from);
            let sender_user_id  = caps.get(2).map(|m| m.as_str()).filter(|s| !s.is_empty()).map(String::from);
            let notif_id        = caps.get(4).map(|m| m.as_str().to_string());
            let created_at_raw  = caps.get(5).map(|m| m.as_str()).unwrap_or("").trim();
            let message         = caps.get(6).map(|m| m.as_str().to_string());

            // created_at: "02/27/2026 05:05:12 UTC" -> "2026-02-27 05:05:12"
            let created_at = NaiveDateTime::parse_from_str(created_at_raw, "%m/%d/%Y %H:%M:%S UTC")
                .ok()
                .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string());

            tx.execute(
                "INSERT OR IGNORE INTO notifications
                 (session_id, notif_id, notif_type, sender_user_id, sender_username, message, created_at, received_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![session_id, notif_id, notif_type, sender_user_id, sender_username, message, created_at, ts_str],
            )?;
            continue;
        }
    }

    progress_callback("コミット中".to_string(), "100%".to_string());

    // ファイル末尾で未クローズのvisitを閉じる
    if let Some(vid) = current_visit_id {
        let last_ts = current_ts
            .map(|t| t.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_default();
        tx.execute(
            "UPDATE world_visits SET leave_time = ?1 WHERE id = ?2 AND leave_time IS NULL",
            params![last_ts, vid],
        )?;
        tx.execute(
            "UPDATE player_visits SET leave_time = ?1 WHERE visit_id = ?2 AND leave_time IS NULL",
            params![last_ts, vid],
        )?;
    }

    tx.execute(
        "UPDATE app_sessions
         SET start_time = ?1, end_time = ?2, my_user_id = ?3, my_display_name = ?4, vrchat_build = ?5
         WHERE log_filename = ?6",
        params![start_time.unwrap_or_default(), end_time, my_user_id, my_display_name, vrchat_build, filename]
    )?;

    tx.commit()?;
    Ok(())
}
/// 単一ファイル用の強化インポート (txt / tar.zst 対応)
pub fn run_enhanced_import<F>(
    db_path: std::path::PathBuf,
    target_path: std::path::PathBuf,
    mut progress_callback: F,
) -> Result<(), String>
where
    F: FnMut(String, String),
{
    let mut conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open DB: {}", e))?;
    
    init_db(&conn)
        .map_err(|e| format!("Failed to init DB: {}", e))?;

    let filename = target_path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
    
    if filename.ends_with(".tar.zst") {
        progress_callback("アーカイブを展開中...".to_string(), "0%".to_string());
        
        let file = std::fs::File::open(&target_path).map_err(|e| e.to_string())?;
        // ② ディスクに .tar を書き出さず、zstdデコーダー → tarアーカイブへ直接ストリーム展開
        let decoder = zstd::stream::Decoder::new(file).map_err(|e| e.to_string())?;
        let mut archive = tar::Archive::new(decoder);

        // txt ファイルのみを BufReader として取り出してインメモリでパース
        let txt_name = filename.replace(".tar.zst", "");
        let mut found = false;
        for entry in archive.entries().map_err(|e| e.to_string())? {
            let mut entry = entry.map_err(|e| e.to_string())?;
            let entry_name = entry.path().map_err(|e| e.to_string())?;
            let entry_name_str = entry_name.to_string_lossy().to_string();
            if entry_name_str == txt_name || entry_name_str.ends_with(&txt_name) {
                found = true;
                progress_callback(format!("処理中: {}", txt_name), "10%".to_string());
                // BufReader でラップしてそのままパーサへ渡す
                parse_and_import_reader(
                    &mut conn,
                    BufReader::new(&mut entry),
                    &txt_name,
                    &mut progress_callback,
                ).map_err(|e| e.to_string())?;
                break;
            }
        }
        if !found {
            return Err(format!("アーカイブ内にログファイルが見つかりません: {}", txt_name));
        }
    } else {
        // 通常の .txt 処理
        progress_callback(format!("処理中: {}", filename), "10%".to_string());
        parse_and_import(&mut conn, &target_path, &filename, &mut progress_callback)
            .map_err(|e| e.to_string())?;
    }

    progress_callback("完了".to_string(), "100%".to_string());
    Ok(())
}
