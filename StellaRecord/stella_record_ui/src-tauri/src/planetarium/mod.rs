mod db;
mod parser;

pub use db::init_db;
pub use parser::*;

use chrono::NaiveDateTime;
use rusqlite::{params, Connection, Result};
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
                eprintln!("[Planetarium] エラー ({}): {}", filename, e);
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
        use winapi::um::winnt::FILE_SHARE_READ;
        fs::OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ)
            .open(log_path)
            .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?
    };
    #[cfg(not(windows))]
    let file = File::open(log_path)
        .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;

    let reader = BufReader::new(file);

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

    progress_callback("パース開始".to_string(), "0%".to_string());

    let mut line_count = 0;
    for line_result in reader.lines() {
        let line = match line_result {
            Ok(l) => l,
            Err(_) => continue,
        };
        line_count += 1;

        if line_count % 1000 == 0 {
            progress_callback(format!("パース中... {} 行", line_count), "".to_string());
        }

        if vrchat_build.is_none() {
            if let Some(caps) = RE_BUILD.captures(&line) {
                vrchat_build = Some(caps.get(1).unwrap().as_str().trim().to_string());
            }
        }

        if let Some(caps) = RE_TIME.captures(&line) {
            let ts_str = caps.get(1).unwrap().as_str();
            if let Ok(dt) = NaiveDateTime::parse_from_str(ts_str, "%Y.%m.%d %H:%M:%S") {
                current_ts = Some(dt);
                let formatted_ts = dt.format("%Y-%m-%d %H:%M:%S").to_string();
                if start_time.is_none() {
                    start_time = Some(formatted_ts.clone());
                }
                end_time = Some(formatted_ts.clone());
            }
        }
        let ts_str = current_ts
            .map(|t| t.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_default();

        if let Some(caps) = RE_USER_AUTH.captures(&line) {
            if my_display_name.is_none() {
                my_display_name = Some(caps.get(1).unwrap().as_str().to_string());
                my_user_id = Some(caps.get(2).unwrap().as_str().to_string());
            }
            continue;
        }

        if let Some(caps) = RE_ENTERING.captures(&line) {
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
            pending_room_name = Some(caps.get(1).unwrap().as_str().to_string());
            current_visit_id = None;
            continue;
        }

        if let Some(caps) = RE_JOINING.captures(&line) {
            if let Some(ref rname) = pending_room_name {
                let world_id = caps.get(1).map(|m| m.as_str()).unwrap_or("").to_string();
                let access_raw = caps.get(3).map(|m| m.as_str().trim()).unwrap_or("").to_string();
                let region = caps.get(4).map(|m| m.as_str()).map(String::from);
                let (access_type, instance_owner) = parse_access_type(&access_raw);
                let full_instance = format!("{}:{}", world_id, access_raw);

                tx.execute(
                    "INSERT INTO world_visits (session_id, world_name, world_id, instance_id, access_type, instance_owner, region, join_time)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    params![session_id, rname, world_id, full_instance, access_type, instance_owner, region, ts_str],
                )?;
                current_visit_id = Some(tx.last_insert_rowid());
            }
            continue;
        }

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

        if let Some(caps) = RE_PLAYER_JOIN.captures(&line) {
            let dname = caps.get(1).unwrap().as_str().to_string();
            let uid = caps.get(2).unwrap().as_str();

            tx.execute(
                "INSERT INTO players (user_id, display_name) VALUES (?1, ?2)
                 ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name",
                params![uid, dname],
            )?;
            let player_id: Option<i64> = tx.query_row(
                "SELECT id FROM players WHERE user_id = ?1",
                params![uid],
                |row| row.get::<_, i64>(0),
            )
            .ok();

            if let (Some(vid), Some(pid)) = (current_visit_id, player_id) {
                let is_local = if dname == "[LocalPlayer]" || line.contains("(Local)") {
                    1
                } else {
                    0
                };
                tx.execute(
                    "INSERT INTO player_visits (visit_id, player_id, is_local, join_time) VALUES (?1, ?2, ?3, ?4)",
                    params![vid, pid, is_local, ts_str],
                )?;
            }
            continue;
        }

        if let Some(caps) = RE_PLAYER_LEFT.captures(&line) {
            let uid = caps.get(2).unwrap().as_str();
            if let Some(vid) = current_visit_id {
                let player_id: Option<i64> = tx.query_row(
                    "SELECT id FROM players WHERE user_id = ?1",
                    params![uid],
                    |row| row.get(0),
                )
                .ok();
                if let Some(pid) = player_id {
                    tx.execute(
                        "UPDATE player_visits SET leave_time = ?1 WHERE visit_id = ?2 AND player_id = ?3 AND leave_time IS NULL",
                        params![ts_str, vid, pid],
                    )?;
                }
            }
            continue;
        }

        if let Some(caps) = RE_IS_LOCAL.captures(&line) {
            let dname_raw = caps.get(1).unwrap().as_str();
            let locality = caps.get(2).unwrap().as_str();
            if locality == "local" {
                if my_display_name.is_none()
                    || my_display_name.as_deref() == Some("[LocalPlayer]")
                {
                    my_display_name = Some(dname_raw.to_string());
                }
                let target_dname = dname_raw.to_string();
                if let Some(vid) = current_visit_id {
                    tx.execute(
                        "UPDATE player_visits SET is_local = 1 
                         WHERE visit_id = ?1 AND player_id IN (SELECT id FROM players WHERE display_name = ?2)",
                        params![vid, target_dname],
                    )?;
                }
            }
            continue;
        }

        if let Some(caps) = RE_AVATAR.captures(&line) {
            if let Some(vid) = current_visit_id {
                let dname = caps.get(1).unwrap().as_str().to_string();
                let avatar = caps.get(2).unwrap().as_str();
                let player_id: Option<i64> = tx
                    .query_row(
                        "SELECT id FROM players WHERE display_name = ?1 LIMIT 1",
                        params![dname],
                        |row| row.get(0),
                    )
                    .ok();
                tx.execute(
                    "INSERT INTO avatar_changes (visit_id, player_id, display_name_raw, avatar_name, timestamp) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![vid, player_id, dname, avatar, ts_str],
                )?;
            }
            continue;
        }

        if let Some(caps) = RE_VIDEO.captures(&line) {
            if let Some(vid) = current_visit_id {
                let url = caps.get(1).unwrap().as_str();
                let requester = caps.get(2).unwrap().as_str().to_string();
                let player_id: Option<i64> = tx
                    .query_row(
                        "SELECT id FROM players WHERE display_name = ?1 LIMIT 1",
                        params![requester],
                        |row| row.get(0),
                    )
                    .ok();
                tx.execute(
                    "INSERT INTO video_playbacks (visit_id, player_id, display_name_raw, url, timestamp) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![vid, player_id, requester, url, ts_str],
                )?;
            }
            continue;
        }

        if let Some(caps) = RE_VIDEO_ALT.captures(&line) {
            if let Some(vid) = current_visit_id {
                let url = caps.get(1).unwrap().as_str();
                tx.execute(
                    "INSERT INTO video_playbacks (visit_id, player_id, display_name_raw, url, timestamp) VALUES (?1, NULL, NULL, ?2, ?3)",
                    params![vid, url, ts_str],
                )?;
            }
            continue;
        }
    }

    progress_callback("コミット中".to_string(), "100%".to_string());

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
        "UPDATE app_sessions SET start_time = ?1, end_time = ?2, my_user_id = ?3, my_display_name = ?4, vrchat_build = ?5 WHERE log_filename = ?6",
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
    
    // .tar.zst の場合は一時展開
    if filename.ends_with(".tar.zst") {
        progress_callback("アーカイブを展開中...".to_string(), "0%".to_string());
        
        let file = std::fs::File::open(&target_path).map_err(|e| e.to_string())?;
        let mut decoder = zstd::stream::Decoder::new(file).map_err(|e| e.to_string())?;
        
        // 一時的な .tar パス (同じディレクトリに作成)
        let tar_path = target_path.with_extension(""); // .tar.zst -> .tar
        {
            let mut tar_file = std::fs::File::create(&tar_path).map_err(|e| e.to_string())?;
            std::io::copy(&mut decoder, &mut tar_file).map_err(|e| e.to_string())?;
        }

        // Tar 展開 (メモリに展開するか、一時ファイルとして扱うか)
        // 今回はシンプルにディレクトリへ展開し、中の txt を探す
        let tar_file = std::fs::File::open(&tar_path).map_err(|e| e.to_string())?;
        let mut archive = tar::Archive::new(tar_file);
        
        // 展開先ディレクトリ (一時的)
        let parent = target_path.parent().unwrap_or(Path::new("."));
        archive.unpack(parent).map_err(|e| e.to_string())?;

        // Tar ファイルを削除
        let _ = std::fs::remove_file(&tar_path);

        // オリジナルの .txt 名称を特定 (X.txt.tar.zst -> X.txt)
        let txt_name = filename.replace(".tar.zst", "");
        let txt_path = parent.join(&txt_name);

        if !txt_path.exists() {
            return Err(format!("展開されたファイルが見つかりません: {}", txt_name));
        }

        progress_callback(format!("処理中: {}", txt_name), "10%".to_string());
        let res = parse_and_import(&mut conn, &txt_path, &txt_name, &mut progress_callback);

        // 展開された .txt も削除 (ユーザー要望により .tar.zst は残すが展開物は消す)
        let _ = std::fs::remove_file(&txt_path);
        
        res.map_err(|e| e.to_string())?;
    } else {
        // 通常の .txt 処理
        progress_callback(format!("処理中: {}", filename), "10%".to_string());
        parse_and_import(&mut conn, &target_path, &filename, &mut progress_callback)
            .map_err(|e| e.to_string())?;
    }

    progress_callback("完了".to_string(), "100%".to_string());
    Ok(())
}
