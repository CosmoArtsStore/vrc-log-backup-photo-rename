mod config;
mod db;
mod parser;
mod archive;

use config::{load_setting, PlanetariumSetting};
use parser::*;
use archive::*;
use db::init_db;

use chrono::{NaiveDateTime, Local};
use rusqlite::{params, Connection, Result};
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::Path;

fn main() -> Result<()> {
    let setting = load_setting();
    let db_path = setting.get_effective_db_path().unwrap_or_else(|_| {
        std::path::PathBuf::from("planetarium.db")
    });
    let tracking = setting.enableUserTracking;

    println!("[Planetarium] DB path: {:?}", db_path);
    println!("[Planetarium] Tracking mode: {}", tracking);

    let mut conn = Connection::open(&db_path)?;
    init_db(&conn)?;

    let args: Vec<String> = std::env::args().collect();
    let force_sync = args.iter().any(|arg| arg == "--force-sync");

    if force_sync {
        run_force_sync(&mut conn, &setting, tracking)?;
    } else {
        run_normal_mode(&mut conn, &setting, tracking)?;
    }

    println!("[Planetarium] 処理完了");
    Ok(())
}

fn run_normal_mode(conn: &mut Connection, setting: &PlanetariumSetting, tracking: bool) -> Result<()> {
    let archive_dir = match setting.get_effective_archive_dir() {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[Planetarium] archivePath の取得に失敗: {}", e);
            return Ok(());
        }
    };

    let log_files = collect_log_files(&archive_dir);
    if log_files.is_empty() {
        println!("[Planetarium] 処理対象ログなし");
        return Ok(());
    }

    println!("[Planetarium] {}件のログを処理します", log_files.len());

    for log_path in &log_files {
        let filename = log_path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let already_processed: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM app_sessions WHERE log_filename = ?1)",
            params![filename],
            |row| row.get(0),
        ).unwrap_or(false);

        if already_processed {
            println!("[Planetarium] スキップ（DB登録済み）: {}", filename);
            // 門番の哲学：運び屋の再配送を許容し、作業場を掃除する
            let _ = fs::remove_file(log_path);
            continue;
        }

        println!("[Planetarium] 処理中: {}", filename);
        if let Err(e) = parse_and_import(conn, log_path, &filename, tracking) {
            eprintln!("[Planetarium] エラー ({}): {}", filename, e);
        } else {
            let current_time = Local::now().format("%Y%m%d_%H%M%S").to_string();
            if let Err(e) = compress_to_tar_zst(log_path, &archive_dir, &current_time) {
                eprintln!("[Planetarium] 圧縮エラー ({}): {}", filename, e);
            }
        }
    }

    Ok(())
}

fn run_force_sync(conn: &mut Connection, setting: &PlanetariumSetting, tracking: bool) -> Result<()> {
    println!("[Planetarium] 強制Syncモードを開始します...");
    
    let archive_dir = match setting.get_effective_archive_dir() {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[Planetarium] archivePath の取得に失敗: {}", e);
            return Ok(());
        }
    };
    
    let zip_dir = archive_dir.join("zip");
    if !zip_dir.exists() {
        println!("[Planetarium] archive/zip/ ディレクトリが存在しません");
        return Ok(());
    }

    let mut zst_files = Vec::new();
    if let Ok(entries) = fs::read_dir(&zip_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.ends_with(".tar.zst") {
                        zst_files.push(path);
                    }
                }
            }
        }
    }
    
    zst_files.sort();
    
    if zst_files.is_empty() {
        println!("[Planetarium] 処理対象の .tar.zst アーカイブがありません");
        return Ok(());
    }
    
    let total = zst_files.len();
    println!("[Planetarium] {}件のアーカイブを処理します", total);
    
    let tmp_dir = zip_dir.join("tmp_sync");
    let _ = fs::create_dir_all(&tmp_dir);
    
    for (i, zst_path) in zst_files.iter().enumerate() {
        let arch_name = zst_path.file_name().unwrap_or_default().to_string_lossy();
        println!("[Planetarium] {} / {} 処理中: {}", i + 1, total, arch_name);
        
        if let Ok(file) = File::open(&zst_path) {
            if let Ok(decoder) = zstd::stream::Decoder::new(file) {
                let mut archive = tar::Archive::new(decoder);
                if archive.unpack(&tmp_dir).is_ok() {
                    if let Ok(entries) = fs::read_dir(&tmp_dir) {
                        for entry in entries.flatten() {
                            let extracted_path = entry.path();
                            if extracted_path.is_file() && extracted_path.extension().and_then(|e| e.to_str()) == Some("txt") {
                                let filename = extracted_path.file_name().unwrap_or_default().to_string_lossy().to_string();
                                let already_processed: bool = conn.query_row(
                                    "SELECT EXISTS(SELECT 1 FROM app_sessions WHERE log_filename = ?1)",
                                    params![filename],
                                    |row| row.get(0),
                                ).unwrap_or(false);
                                
                                if !already_processed {
                                    if let Err(e) = parse_and_import(conn, &extracted_path, &filename, tracking) {
                                        eprintln!("[Planetarium] パースエラー ({}): {}", filename, e);
                                    }
                                }
                                let _ = fs::remove_file(&extracted_path);
                            }
                        }
                    }
                }
            }
        }
    }
    
    let _ = fs::remove_dir_all(&tmp_dir);
    println!("[Planetarium] 強制Sync完了");
    Ok(())
}

fn parse_and_import(
    conn: &mut Connection,
    log_path: &Path,
    filename: &str,
    tracking: bool,
) -> Result<()> {
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
    let file = File::open(log_path).map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;

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

    println!("[Planetarium] [PROGRESS] 0%");

    let mut line_count = 0;
    for line_result in reader.lines() {
        let line = match line_result {
            Ok(l) => l,
            Err(_) => continue,
        };
        line_count += 1;

        if line_count % 1000 == 0 {
            println!("[Planetarium] [STATUS] パース中... {} 行", line_count);
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
        let ts_str = current_ts.map(|t| t.format("%Y-%m-%d %H:%M:%S").to_string()).unwrap_or_default();

        if let Some(caps) = RE_USER_AUTH.captures(&line) {
            if my_display_name.is_none() {
                let dname = caps.get(1).unwrap().as_str().to_string();
                if tracking {
                    my_display_name = Some(dname);
                    my_user_id = Some(caps.get(2).unwrap().as_str().to_string());
                } else {
                    my_display_name = Some("[LocalPlayer]".to_string());
                    my_user_id = None;
                }
            }
            continue;
        }

        if let Some(caps) = RE_ENTERING.captures(&line) {
            if let Some(vid) = current_visit_id {
                tx.execute("UPDATE world_visits SET leave_time = ?1 WHERE id = ?2 AND leave_time IS NULL", params![ts_str, vid])?;
                tx.execute("UPDATE player_visits SET leave_time = ?1 WHERE visit_id = ?2 AND leave_time IS NULL", params![ts_str, vid])?;
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
                let (access_type, instance_owner) = parse_access_type(&access_raw, tracking);
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
                tx.execute("UPDATE world_visits SET leave_time = ?1 WHERE id = ?2 AND leave_time IS NULL", params![ts_str, vid])?;
                tx.execute("UPDATE player_visits SET leave_time = ?1 WHERE visit_id = ?2 AND leave_time IS NULL", params![ts_str, vid])?;
                current_visit_id = None;
                pending_room_name = None;
            }
            continue;
        }

        if let Some(caps) = RE_PLAYER_JOIN.captures(&line) {
            let mut dname = caps.get(1).unwrap().as_str().to_string();
            let uid = caps.get(2).unwrap().as_str();
            
            if !tracking {
                if let Some(ref my_name) = my_display_name {
                    if &dname == my_name || dname.contains("(Local)") { dname = "[LocalPlayer]".to_string(); }
                    else { dname = "[User_Masked]".to_string(); }
                } else { dname = "[User_Masked]".to_string(); }
            }

            let player_id = if tracking {
                tx.execute(
                    "INSERT INTO players (user_id, display_name) VALUES (?1, ?2)
                     ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name",
                    params![uid, dname],
                )?;
                tx.query_row("SELECT id FROM players WHERE user_id = ?1", params![uid], |row| row.get::<_, i64>(0)).ok()
            } else {
                tx.execute("INSERT OR IGNORE INTO players (user_id, display_name) VALUES (NULL, ?1)", params![dname])?;
                tx.query_row("SELECT id FROM players WHERE display_name = ?1 AND user_id IS NULL LIMIT 1", params![dname], |row| row.get::<_, i64>(0)).ok()
            };

            if let (Some(vid), Some(pid)) = (current_visit_id, player_id) {
                let is_local = if dname == "[LocalPlayer]" || line.contains("(Local)") { 1 } else { 0 };
                tx.execute("INSERT INTO player_visits (visit_id, player_id, is_local, join_time) VALUES (?1, ?2, ?3, ?4)", params![vid, pid, is_local, ts_str])?;
            }
            continue;
        }

        if let Some(caps) = RE_PLAYER_LEFT.captures(&line) {
            let mut dname = caps.get(1).unwrap().as_str().to_string();
            let uid = caps.get(2).unwrap().as_str();
            if !tracking {
                if let Some(ref my_name) = my_display_name {
                    if &dname == my_name || dname.contains("(Local)") { dname = "[LocalPlayer]".to_string(); }
                    else { dname = "[User_Masked]".to_string(); }
                } else { dname = "[User_Masked]".to_string(); }
            }
            if let Some(vid) = current_visit_id {
                let player_id: Option<i64> = if tracking {
                    tx.query_row("SELECT id FROM players WHERE user_id = ?1", params![uid], |row| row.get(0)).ok()
                } else {
                    tx.query_row("SELECT id FROM players WHERE display_name = ?1 AND user_id IS NULL LIMIT 1", params![dname], |row| row.get(0)).ok()
                };
                if let Some(pid) = player_id {
                    tx.execute("UPDATE player_visits SET leave_time = ?1 WHERE visit_id = ?2 AND player_id = ?3 AND leave_time IS NULL", params![ts_str, vid, pid])?;
                }
            }
            continue;
        }

        if let Some(caps) = RE_IS_LOCAL.captures(&line) {
            let dname_raw = caps.get(1).unwrap().as_str();
            let locality = caps.get(2).unwrap().as_str();
            if locality == "local" {
                if my_display_name.is_none() || my_display_name.as_deref() == Some("[LocalPlayer]") {
                    my_display_name = Some(dname_raw.to_string());
                }
                let target_dname = if tracking { dname_raw.to_string() } else { "[LocalPlayer]".to_string() };
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
                let mut dname = caps.get(1).unwrap().as_str().to_string();
                let avatar = caps.get(2).unwrap().as_str();
                if !tracking {
                    if let Some(ref my_name) = my_display_name {
                        if &dname == my_name || dname.contains("(Local)") { dname = "[LocalPlayer]".to_string(); }
                        else { dname = "[User_Masked]".to_string(); }
                    } else { dname = "[User_Masked]".to_string(); }
                }
                let player_id: Option<i64> = tx.query_row("SELECT id FROM players WHERE display_name = ?1 LIMIT 1", params![dname], |row| row.get(0)).ok();
                tx.execute("INSERT INTO avatar_changes (visit_id, player_id, display_name_raw, avatar_name, timestamp) VALUES (?1, ?2, ?3, ?4, ?5)", params![vid, player_id, dname, avatar, ts_str])?;
            }
            continue;
        }

        if let Some(caps) = RE_VIDEO.captures(&line) {
            if let Some(vid) = current_visit_id {
                let url = caps.get(1).unwrap().as_str();
                let mut requester = caps.get(2).unwrap().as_str().to_string();
                if !tracking {
                    if let Some(ref my_name) = my_display_name {
                        if &requester == my_name || requester.contains("(Local)") { requester = "[LocalPlayer]".to_string(); }
                        else { requester = "[User_Masked]".to_string(); }
                    } else { requester = "[User_Masked]".to_string(); }
                }
                let player_id: Option<i64> = tx.query_row("SELECT id FROM players WHERE display_name = ?1 LIMIT 1", params![requester], |row| row.get(0)).ok();
                tx.execute("INSERT INTO video_playbacks (visit_id, player_id, display_name_raw, url, timestamp) VALUES (?1, ?2, ?3, ?4, ?5)", params![vid, player_id, requester, url, ts_str])?;
            }
            continue;
        }

        if let Some(caps) = RE_VIDEO_ALT.captures(&line) {
            if let Some(vid) = current_visit_id {
                let url = caps.get(1).unwrap().as_str();
                tx.execute("INSERT INTO video_playbacks (visit_id, player_id, display_name_raw, url, timestamp) VALUES (?1, NULL, NULL, ?2, ?3)", params![vid, url, ts_str])?;
            }
            continue;
        }
    }
    println!("[Planetarium] [PROGRESS] 100%");

    if let Some(vid) = current_visit_id {
        let last_ts = current_ts.map(|t| t.format("%Y-%m-%d %H:%M:%S").to_string()).unwrap_or_default();
        tx.execute("UPDATE world_visits SET leave_time = ?1 WHERE id = ?2 AND leave_time IS NULL", params![last_ts, vid])?;
        tx.execute("UPDATE player_visits SET leave_time = ?1 WHERE visit_id = ?2 AND leave_time IS NULL", params![last_ts, vid])?;
    }

    let my_uid_stored = if tracking { my_user_id.clone() } else { None };
    tx.execute(
        "UPDATE app_sessions SET start_time = ?1, end_time = ?2, my_user_id = ?3, my_display_name = ?4, vrchat_build = ?5 WHERE log_filename = ?6",
        params![start_time.unwrap_or_default(), end_time, my_uid_stored, my_display_name, vrchat_build, filename]
    )?;

    tx.commit()?;
    Ok(())
}
