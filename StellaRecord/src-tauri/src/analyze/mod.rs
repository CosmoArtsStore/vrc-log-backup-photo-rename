mod db;
mod parser;

pub use db::{init_extends_db, init_main_db};
pub use parser::*;

use chrono::NaiveDateTime;
use rusqlite::{params, Connection, Result, Transaction};
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

fn analyze_err<E: std::fmt::Display>(context: &str, err: E) -> String {
    format!("{}: {}", context, err)
}

#[derive(Copy, Clone)]
enum DebugBlockKind {
    Environment,
    UserSettings,
}

struct NotificationContext {
    notif_id: String,
    target_world_id: Option<String>,
}

impl NotificationContext {
    fn from_notification(notif_id: String, target_world_id: Option<String>) -> Self {
        Self {
            notif_id,
            target_world_id,
        }
    }
}

fn collect_log_files(archive_dir: &Path) -> Vec<PathBuf> {
    let mut files = Vec::new();
    let zst_dir = archive_dir.join("zst");
    if !zst_dir.exists() {
        return files;
    }
    let entries = match fs::read_dir(&zst_dir) {
        Ok(entries) => entries,
        Err(err) => {
            crate::utils::log_warn(&format!(
                "archive directory read failed [{}]: {}",
                zst_dir.display(),
                err
            ));
            return files;
        }
    };
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(err) => {
                crate::utils::log_warn(&format!("archive entry read failed: {}", err));
                continue;
            }
        };
        let path = entry.path();
        if path.is_file() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with("output_log_") && name.ends_with(".txt.tar.zst") {
                    files.push(path);
                }
            }
        }
    }
    files.sort();
    files
}

fn source_name_for_archive(path: &Path) -> Option<String> {
    let file_name = path.file_name()?.to_str()?;
    Some(file_name.trim_end_matches(".tar.zst").to_string())
}

fn insert_debug_snapshot(
    extends_tx: &Transaction<'_>,
    filename: &str,
    snapshot_type: &str,
    captured_at: &str,
    key_name: &str,
    value_text: Option<&str>,
    value_json: Option<&str>,
) -> Result<()> {
    extends_tx.execute(
        "INSERT INTO session_debug_snapshots
         (log_filename, snapshot_type, captured_at, key_name, value_text, value_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![filename, snapshot_type, captured_at, key_name, value_text, value_json],
    )?;
    Ok(())
}

fn insert_travel_event(
    tx: &Transaction<'_>,
    session_id: i64,
    event_type: &str,
    location: &ParsedLocation,
    world_name: Option<&str>,
    timestamp: &str,
    source_notif_id: Option<&str>,
) -> Result<()> {
    tx.execute(
        "INSERT INTO travel_events
         (session_id, event_type, world_id, world_name, instance_id, access_type, instance_owner, region, timestamp, source_notif_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            session_id,
            event_type,
            location.world_id.as_deref(),
            world_name,
            location.instance_id.as_deref(),
            location.access_type.as_deref(),
            location.instance_owner.as_deref(),
            location.region.as_deref(),
            timestamp,
            source_notif_id
        ],
    )?;
    Ok(())
}

fn resolve_player_id(
    tx: &Transaction<'_>,
    player_id_cache: &mut HashMap<String, i64>,
    user_id: &str,
) -> Option<i64> {
    if let Some(&pid) = player_id_cache.get(user_id) {
        return Some(pid);
    }

    let pid: Option<i64> = tx
        .query_row(
            "SELECT id FROM players WHERE user_id = ?1",
            params![user_id],
            |row| row.get::<_, i64>(0),
        )
        .ok();
    if let Some(pid) = pid {
        player_id_cache.insert(user_id.to_string(), pid);
    }
    pid
}

pub fn run_diff_import<F>(
    main_db_path: PathBuf,
    extends_db_path: PathBuf,
    archive_dir: PathBuf,
    mut progress_callback: F,
) -> Result<(), String>
where
    F: FnMut(String, String),
{
    let mut main_conn = Connection::open(&main_db_path).map_err(|e| {
        analyze_err(
            &format!("Failed to open main DB at {}", main_db_path.display()),
            e,
        )
    })?;
    let mut extends_conn = Connection::open(&extends_db_path).map_err(|e| {
        analyze_err(
            &format!("Failed to open extends DB at {}", extends_db_path.display()),
            e,
        )
    })?;

    init_main_db(&main_conn).map_err(|e| analyze_err("Failed to init main DB", e))?;
    init_extends_db(&extends_conn).map_err(|e| analyze_err("Failed to init extends DB", e))?;

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
        let filename = match source_name_for_archive(log_path) {
            Some(v) => v.to_string(),
            None => continue,
        };

        let already_processed: bool = main_conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM app_sessions WHERE log_filename = ?1)",
                params![filename],
                |row| row.get(0),
            )
            .map_err(|e| analyze_err("Failed to check session existence", e))?;

        if already_processed {
            let progress_pct = ((idx + 1) as f32 / total as f32 * 100.0) as u32;
            progress_callback(
                format!("スキップ（DB登録済み）: {}", filename),
                format!("{}%", progress_pct),
            );
            continue;
        }

        progress_callback(
            format!("処理中: {}", filename),
            format!("{}%", ((idx as f32 / total as f32) * 100.0) as u32),
        );

        if let Err(err) = parse_and_import(
            &mut main_conn,
            &mut extends_conn,
            log_path,
            &filename,
            &mut progress_callback,
        ) {
            crate::utils::log_err(&format!("[StellaRecord] エラー ({}): {}", filename, err));
        }
    }

    progress_callback("処理完了".to_string(), "100%".to_string());
    Ok(())
}

fn parse_and_import<F>(
    main_conn: &mut Connection,
    extends_conn: &mut Connection,
    log_path: &Path,
    filename: &str,
    progress_callback: &mut F,
) -> Result<()>
where
    F: FnMut(String, String),
{
    if log_path
        .file_name()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.ends_with(".tar.zst"))
    {
        let file = fs::File::open(log_path)
            .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;
        let decoder = zstd::stream::Decoder::new(file)
            .map_err(|e| rusqlite::Error::InvalidParameterName(e.to_string()))?;
        let mut archive = tar::Archive::new(decoder);

        let entries = archive
            .entries()
            .map_err(|err| rusqlite::Error::InvalidParameterName(err.to_string()))?;
        for entry in entries {
            let mut entry =
                entry.map_err(|err| rusqlite::Error::InvalidParameterName(err.to_string()))?;
            return parse_and_import_reader(
                main_conn,
                extends_conn,
                BufReader::new(&mut entry),
                filename,
                progress_callback,
            );
        }

        return Err(rusqlite::Error::InvalidParameterName(
            "archive is empty".to_string(),
        ));
    }

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

    parse_and_import_reader(
        main_conn,
        extends_conn,
        BufReader::new(file),
        filename,
        progress_callback,
    )
}

fn parse_and_import_reader<R, F>(
    main_conn: &mut Connection,
    extends_conn: &mut Connection,
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
    let mut pending_debug_block: Option<DebugBlockKind> = None;
    let mut pending_notification: Option<NotificationContext> = None;

    let main_tx = main_conn.transaction()?;
    let extends_tx = extends_conn.transaction()?;

    main_tx.execute(
        "INSERT OR IGNORE INTO app_sessions (start_time, end_time, my_user_id, my_display_name, vrchat_build, log_filename)
         VALUES ('', NULL, NULL, NULL, NULL, ?1)",
        params![filename],
    )?;
    let session_id: i64 = main_tx.query_row(
        "SELECT id FROM app_sessions WHERE log_filename = ?1",
        params![filename],
        |row| row.get(0),
    )?;

    let mut player_id_cache: HashMap<String, i64> = HashMap::new();
    progress_callback("パース開始".to_string(), "0%".to_string());

    let mut line_count = 0;
    for line_result in reader.lines() {
        let line = match line_result {
            Ok(line) => line,
            Err(_) => continue,
        };
        line_count += 1;

        if line_count % 5000 == 0 {
            progress_callback(format!("パース中... {} 行", line_count), "".to_string());
        }

        if let Some(caps) = RE_TIME.captures(&line) {
            let Some(match_ts) = caps.get(1) else {
                continue;
            };
            let ts_str = match_ts.as_str();
            if let Ok(dt) = NaiveDateTime::parse_from_str(ts_str, "%Y.%m.%d %H:%M:%S") {
                current_ts = Some(dt);
                let formatted = dt.format("%Y-%m-%d %H:%M:%S").to_string();
                if start_time.is_none() {
                    start_time = Some(formatted.clone());
                }
                end_time = Some(formatted);
            } else {
                crate::utils::log_warn(&format!(
                    "timestamp parse skipped [{}]: {}",
                    filename, ts_str
                ));
            }
        }
        let ts_str = current_ts
            .map(|t| t.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_default();

        if let Some(kind) = pending_debug_block {
            if line.starts_with("    ") {
                if let Some(caps) = RE_ENVIRONMENT_LINE.captures(&line) {
                    let key_name = caps.get(1).map(|m| m.as_str().trim()).unwrap_or_default();
                    let value = caps.get(2).map(|m| m.as_str().trim()).unwrap_or_default();
                    let snapshot_type = match kind {
                        DebugBlockKind::Environment => "environment",
                        DebugBlockKind::UserSettings => "user_settings",
                    };
                    insert_debug_snapshot(
                        &extends_tx,
                        filename,
                        snapshot_type,
                        &ts_str,
                        key_name,
                        Some(value),
                        None,
                    )?;
                }
                continue;
            }
            pending_debug_block = None;
        }

        if line.contains("[UserInfoLogger] Environment Info:") {
            pending_debug_block = Some(DebugBlockKind::Environment);
            continue;
        }
        if line.contains("[UserInfoLogger] User Settings Info:") {
            pending_debug_block = Some(DebugBlockKind::UserSettings);
            continue;
        }

        if vrchat_build.is_none() {
            if let Some(caps) = RE_BUILD.captures(&line) {
                if let Some(matched) = caps.get(1) {
                    vrchat_build = Some(matched.as_str().trim().to_string());
                }
            }
        }

        if let Some(caps) = RE_USER_AUTH.captures(&line) {
            if my_display_name.is_none() {
                if let (Some(name_match), Some(user_match)) = (caps.get(1), caps.get(2)) {
                    my_display_name = Some(name_match.as_str().to_string());
                    my_user_id = Some(user_match.as_str().to_string());
                }
            }
            continue;
        }

        if let Some(caps) = RE_GOING_HOME.captures(&line) {
            if let Some(location_match) = caps.get(1) {
                let location = parse_location(location_match.as_str());
                insert_travel_event(
                    &main_tx,
                    session_id,
                    "home",
                    &location,
                    None,
                    &ts_str,
                    None,
                )?;
            }
            continue;
        }

        if let Some(caps) = RE_DESTINATION_EVENT.captures(&line) {
            let Some(event_type_match) = caps.get(1) else {
                continue;
            };
            let Some(location_match) = caps.get(2) else {
                continue;
            };
            let event_type = event_type_match.as_str();
            let location = parse_location(location_match.as_str());
            let source_notif_id = pending_notification.as_ref().and_then(|context| {
                if context.target_world_id == location.world_id {
                    Some(context.notif_id.as_str())
                } else {
                    None
                }
            });
            insert_travel_event(
                &main_tx,
                session_id,
                event_type,
                &location,
                None,
                &ts_str,
                source_notif_id,
            )?;
            if event_type == "set" && source_notif_id.is_some() {
                pending_notification = None;
            }
            continue;
        }

        if let Some(caps) = RE_ENTERING.captures(&line) {
            if let Some(visit_id) = current_visit_id {
                main_tx.execute(
                    "UPDATE world_visits SET leave_time = ?1 WHERE id = ?2 AND leave_time IS NULL",
                    params![ts_str, visit_id],
                )?;
                main_tx.execute(
                    "UPDATE player_visits SET leave_time = ?1 WHERE visit_id = ?2 AND leave_time IS NULL",
                    params![ts_str, visit_id],
                )?;
            }
            if let Some(room_match) = caps.get(1) {
                pending_room_name = Some(room_match.as_str().to_string());
            }
            current_visit_id = None;
            continue;
        }

        if let Some(caps) = RE_JOINING.captures(&line) {
            if let Some(room_name) = pending_room_name.as_ref() {
                let Some(world_id_match) = caps.get(1) else {
                    continue;
                };
                let world_id = world_id_match.as_str().to_string();
                let instance_id = caps
                    .get(2)
                    .map(|m| m.as_str().to_string())
                    .unwrap_or_default();
                let Some(access_match) = caps.get(3) else {
                    continue;
                };
                let access_raw = access_match.as_str().trim().to_string();
                let region = caps.get(4).map(|m| m.as_str().to_string());
                let (access_type, instance_owner) = parse_access_type(&access_raw);

                main_tx.execute(
                    "INSERT INTO world_visits
                     (session_id, world_name, world_id, instance_id, access_type, instance_owner, region, join_time)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    params![
                        session_id,
                        room_name,
                        world_id,
                        instance_id,
                        access_type,
                        instance_owner,
                        region,
                        ts_str
                    ],
                )?;
                current_visit_id = Some(main_tx.last_insert_rowid());
            }
            continue;
        }

        if RE_LEFT_ROOM.is_match(&line) {
            if let Some(visit_id) = current_visit_id {
                main_tx.execute(
                    "UPDATE world_visits SET leave_time = ?1 WHERE id = ?2 AND leave_time IS NULL",
                    params![ts_str, visit_id],
                )?;
                main_tx.execute(
                    "UPDATE player_visits SET leave_time = ?1 WHERE visit_id = ?2 AND leave_time IS NULL",
                    params![ts_str, visit_id],
                )?;
                current_visit_id = None;
                pending_room_name = None;
            }
            continue;
        }

        if let Some(caps) = RE_PLAYER_JOIN.captures(&line) {
            let (Some(display_match), Some(user_match)) = (caps.get(1), caps.get(2)) else {
                continue;
            };
            let display_name = display_match.as_str().to_string();
            let user_id = user_match.as_str().to_string();

            main_tx.execute(
                "INSERT INTO players (user_id, display_name) VALUES (?1, ?2)
                 ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name",
                params![user_id, display_name],
            )?;

            let player_id = resolve_player_id(&main_tx, &mut player_id_cache, &user_id);
            if let (Some(visit_id), Some(player_id)) = (current_visit_id, player_id) {
                main_tx.execute(
                    "INSERT OR IGNORE INTO player_visits (visit_id, player_id, is_self, join_time)
                     VALUES (?1, ?2, 0, ?3)",
                    params![visit_id, player_id, ts_str],
                )?;
                main_tx.execute(
                    "INSERT INTO player_visit_events (visit_id, player_id, event_type, timestamp)
                     VALUES (?1, ?2, 'joined', ?3)",
                    params![visit_id, player_id, ts_str],
                )?;
            }
            continue;
        }

        if let Some(caps) = RE_PLAYER_JOIN_COMPLETE.captures(&line) {
            let Some(display_match) = caps.get(1) else {
                continue;
            };
            if let Some(visit_id) = current_visit_id {
                let display_name = display_match.as_str();
                let player_id: Option<i64> = main_tx
                    .query_row(
                        "SELECT id FROM players WHERE display_name = ?1 ORDER BY id DESC LIMIT 1",
                        params![display_name],
                        |row| row.get(0),
                    )
                    .ok();
                if let Some(player_id) = player_id {
                    main_tx.execute(
                        "INSERT INTO player_visit_events (visit_id, player_id, event_type, timestamp)
                         VALUES (?1, ?2, 'join_complete', ?3)",
                        params![visit_id, player_id, ts_str],
                    )?;
                }
            }
            continue;
        }

        if let Some(caps) = RE_PLAYER_LEFT.captures(&line) {
            let Some(user_match) = caps.get(2) else {
                continue;
            };
            let user_id = user_match.as_str().to_string();
            if let Some(visit_id) = current_visit_id {
                let player_id = resolve_player_id(&main_tx, &mut player_id_cache, &user_id);
                if let Some(player_id) = player_id {
                    main_tx.execute(
                        "UPDATE player_visits SET leave_time = ?1
                         WHERE visit_id = ?2 AND player_id = ?3 AND leave_time IS NULL",
                        params![ts_str, visit_id, player_id],
                    )?;
                    main_tx.execute(
                        "INSERT INTO player_visit_events (visit_id, player_id, event_type, timestamp)
                         VALUES (?1, ?2, 'left', ?3)",
                        params![visit_id, player_id, ts_str],
                    )?;
                }
            }
            continue;
        }

        if let Some(caps) = RE_IS_LOCAL.captures(&line) {
            let (Some(display_match), Some(locality_match)) = (caps.get(1), caps.get(2)) else {
                continue;
            };
            let display_name = display_match.as_str();
            let locality = locality_match.as_str();
            if locality == "local" {
                if my_display_name.is_none() || my_display_name.as_deref() == Some("[LocalPlayer]") {
                    my_display_name = Some(display_name.to_string());
                }
                if let Some(visit_id) = current_visit_id {
                    main_tx.execute(
                        "UPDATE player_visits SET is_self = 1
                         WHERE visit_id = ?1
                           AND player_id IN (SELECT id FROM players WHERE display_name = ?2)",
                        params![visit_id, display_name],
                    )?;
                }
            }
            continue;
        }

        if let Some(caps) = RE_VIDEO.captures(&line) {
            if let Some(visit_id) = current_visit_id {
                if let Some(url_match) = caps.get(1) {
                    let url = url_match.as_str().trim_end_matches(',').trim().to_string();
                    main_tx.execute(
                        "INSERT INTO video_playbacks (visit_id, url, timestamp) VALUES (?1, ?2, ?3)",
                        params![visit_id, url, ts_str],
                    )?;
                }
            }
            continue;
        }

        if let Some(caps) = RE_VIDEO_ALT.captures(&line) {
            if let Some(visit_id) = current_visit_id {
                if let Some(url_match) = caps.get(1) {
                    main_tx.execute(
                        "INSERT INTO video_playbacks (visit_id, url, timestamp) VALUES (?1, ?2, ?3)",
                        params![visit_id, url_match.as_str(), ts_str],
                    )?;
                }
            }
            continue;
        }

        if let Some(caps) = RE_NOTIFICATION.captures(&line) {
            let Some(type_match) = caps.get(3) else {
                continue;
            };
            let notif_type = type_match.as_str().trim().to_string();
            if !is_collectible_notification(&notif_type) {
                continue;
            }

            let sender_username = caps
                .get(1)
                .map(|m| m.as_str())
                .filter(|s| !s.is_empty())
                .map(String::from);
            let sender_user_id = caps
                .get(2)
                .map(|m| m.as_str())
                .filter(|s| !s.is_empty())
                .map(String::from);
            let notif_id = caps.get(4).map(|m| m.as_str().to_string());
            let Some(created_match) = caps.get(5) else {
                continue;
            };
            let created_at_raw = created_match.as_str().trim();
            let message = caps.get(6).map(|m| m.as_str().to_string());
            let created_at = NaiveDateTime::parse_from_str(created_at_raw, "%m/%d/%Y %H:%M:%S UTC")
                .ok()
                .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string());

            let location = RE_NOTIFICATION_WORLD_ID
                .captures(&line)
                .and_then(|captures| captures.get(1))
                .map(|m| parse_location(m.as_str()))
                .unwrap_or_default();
            let target_world_name = RE_NOTIFICATION_WORLD_NAME
                .captures(&line)
                .and_then(|captures| captures.get(1))
                .map(|m| m.as_str().to_string());

            main_tx.execute(
                "INSERT OR IGNORE INTO notifications
                 (session_id, notif_id, notif_type, sender_user_id, sender_username, message, created_at, received_at,
                  target_world_id, target_world_name, target_instance_id, target_access_type, target_instance_owner, target_region)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
                params![
                    session_id,
                    notif_id,
                    notif_type,
                    sender_user_id,
                    sender_username,
                    message,
                    created_at,
                    ts_str,
                    location.world_id.as_deref(),
                    target_world_name.as_deref(),
                    location.instance_id.as_deref(),
                    location.access_type.as_deref(),
                    location.instance_owner.as_deref(),
                    location.region.as_deref()
                ],
            )?;

            if let Some(notif_id) = notif_id {
                pending_notification = Some(NotificationContext::from_notification(
                    notif_id,
                    location.world_id,
                ));
            }
            continue;
        }

        if let Some(caps) = RE_DEVICE_LINE.captures(&line) {
            let device_index = caps.get(1).map(|m| m.as_str()).unwrap_or_default();
            let device_name = caps.get(2).map(|m| m.as_str()).unwrap_or_default();
            let min_freq = caps.get(3).map(|m| m.as_str()).unwrap_or_default();
            let max_freq = caps.get(4).map(|m| m.as_str()).unwrap_or_default();
            let value_json = format!(
                "{{\"index\":\"{}\",\"name\":\"{}\",\"min_freq\":\"{}\",\"max_freq\":\"{}\"}}",
                device_index,
                device_name.replace('\"', "\\\""),
                min_freq,
                max_freq
            );
            insert_debug_snapshot(
                &extends_tx,
                filename,
                "audio_device",
                &ts_str,
                device_name,
                Some(device_name),
                Some(&value_json),
            )?;
            continue;
        }

        if line.contains("Microphones installed (") {
            insert_debug_snapshot(
                &extends_tx,
                filename,
                "audio_device",
                &ts_str,
                "device_inventory",
                Some(&line),
                None,
            )?;
            continue;
        }

        if let Some(caps) = RE_SUBSCRIPTION_STATUS.captures(&line) {
            let subscription_id = caps.get(1).map(|m| m.as_str()).unwrap_or_default();
            let active = caps.get(2).map(|m| m.as_str()).unwrap_or_default();
            let desc = caps.get(3).map(|m| m.as_str()).unwrap_or_default();
            let value_json = format!(
                "{{\"subscription_id\":\"{}\",\"active\":\"{}\",\"description\":\"{}\"}}",
                subscription_id.replace('\"', "\\\""),
                active,
                desc.replace('\"', "\\\"")
            );
            insert_debug_snapshot(
                &extends_tx,
                filename,
                "subscription",
                &ts_str,
                "vrchat_subscription",
                Some(active),
                Some(&value_json),
            )?;
            continue;
        }

        if let Some(caps) = RE_BEST_REGION.captures(&line) {
            if let Some(region_match) = caps.get(1) {
                insert_debug_snapshot(
                    &extends_tx,
                    filename,
                    "network",
                    &ts_str,
                    "best_region",
                    Some(region_match.as_str()),
                    None,
                )?;
            }
            continue;
        }

        if let Some(caps) = RE_CURRENT_UTC.captures(&line) {
            let utc_value = caps.get(1).map(|m| m.as_str()).unwrap_or_default();
            let sync_secs = caps.get(2).map(|m| m.as_str()).unwrap_or_default();
            let value_json = format!(
                "{{\"utc\":\"{}\",\"sync_seconds\":\"{}\"}}",
                utc_value.replace('\"', "\\\""),
                sync_secs
            );
            insert_debug_snapshot(
                &extends_tx,
                filename,
                "system_clock",
                &ts_str,
                "utc_sync",
                Some(utc_value),
                Some(&value_json),
            )?;
            continue;
        }

        if line.contains("Fetched local user permissions") {
            insert_debug_snapshot(
                &extends_tx,
                filename,
                "permission",
                &ts_str,
                "local_user_permissions",
                Some("fetched"),
                None,
            )?;
        }
    }

    progress_callback("コミット中".to_string(), "100%".to_string());

    if let Some(visit_id) = current_visit_id {
        let last_ts = current_ts
            .map(|t| t.format("%Y-%m-%d %H:%M:%S").to_string())
            .unwrap_or_default();
        main_tx.execute(
            "UPDATE world_visits SET leave_time = ?1 WHERE id = ?2 AND leave_time IS NULL",
            params![last_ts, visit_id],
        )?;
        main_tx.execute(
            "UPDATE player_visits SET leave_time = ?1 WHERE visit_id = ?2 AND leave_time IS NULL",
            params![last_ts, visit_id],
        )?;
    }

    main_tx.execute(
        "UPDATE app_sessions
         SET start_time = ?1, end_time = ?2, my_user_id = ?3, my_display_name = ?4, vrchat_build = ?5
         WHERE log_filename = ?6",
        params![
            start_time.unwrap_or_default(),
            end_time,
            my_user_id,
            my_display_name,
            vrchat_build,
            filename
        ],
    )?;

    main_tx.commit()?;
    extends_tx.commit()?;
    Ok(())
}

pub fn run_enhanced_import<F>(
    main_db_path: PathBuf,
    extends_db_path: PathBuf,
    target_path: PathBuf,
    mut progress_callback: F,
) -> Result<(), String>
where
    F: FnMut(String, String),
{
    let mut main_conn = Connection::open(&main_db_path).map_err(|e| {
        analyze_err(
            &format!("Failed to open main DB at {}", main_db_path.display()),
            e,
        )
    })?;
    let mut extends_conn = Connection::open(&extends_db_path).map_err(|e| {
        analyze_err(
            &format!("Failed to open extends DB at {}", extends_db_path.display()),
            e,
        )
    })?;

    init_main_db(&main_conn).map_err(|e| analyze_err("Failed to init main DB", e))?;
    init_extends_db(&extends_conn).map_err(|e| analyze_err("Failed to init extends DB", e))?;

    let filename = target_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Invalid target file name".to_string())?
        .to_string();

    if filename.ends_with(".tar.zst") {
        progress_callback("アーカイブを展開中...".to_string(), "0%".to_string());

        let file = std::fs::File::open(&target_path)
            .map_err(|e| analyze_err(&format!("Failed to open {}", target_path.display()), e))?;
        let decoder = zstd::stream::Decoder::new(file)
            .map_err(|e| analyze_err("Failed to create zstd decoder", e))?;
        let mut archive = tar::Archive::new(decoder);

        let txt_name = filename.replace(".tar.zst", "");
        let mut found = false;
        for entry in archive
            .entries()
            .map_err(|e| analyze_err("Failed to enumerate archive entries", e))?
        {
            let mut entry = entry.map_err(|e| analyze_err("Failed to read archive entry", e))?;
            let entry_name = entry
                .path()
                .map_err(|e| analyze_err("Failed to resolve archive entry path", e))?;
            let entry_name_str = entry_name.to_string_lossy().to_string();
            if entry_name_str == txt_name || entry_name_str.ends_with(&txt_name) {
                found = true;
                progress_callback(format!("処理中: {}", txt_name), "10%".to_string());
                parse_and_import_reader(
                    &mut main_conn,
                    &mut extends_conn,
                    BufReader::new(&mut entry),
                    &txt_name,
                    &mut progress_callback,
                )
                .map_err(|e| analyze_err("Failed to import archive log", e))?;
                break;
            }
        }
        if !found {
            return Err(format!(
                "アーカイブ内にログファイルが見つかりません: {}",
                txt_name
            ));
        }
    } else {
        progress_callback(format!("処理中: {}", filename), "10%".to_string());
        parse_and_import(
            &mut main_conn,
            &mut extends_conn,
            &target_path,
            &filename,
            &mut progress_callback,
        )
        .map_err(|e| analyze_err("Failed to import text log", e))?;
    }

    progress_callback("完了".to_string(), "100%".to_string());
    Ok(())
}
