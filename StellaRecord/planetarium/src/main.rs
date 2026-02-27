mod config;

use config::{load_setting, PlanetariumSetting};
use chrono::NaiveDateTime;
use regex::Regex;
use rusqlite::{params, Connection, Result};
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::Path;

// §6.4 全6テーブルの CREATE TABLE 文
const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS app_sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    start_time      DATETIME NOT NULL,
    end_time        DATETIME,
    my_user_id      TEXT,
    my_display_name TEXT,
    vrchat_build    TEXT,
    log_filename    TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS world_visits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL,
    world_name      TEXT NOT NULL,
    world_id        TEXT NOT NULL,
    instance_id     TEXT NOT NULL,
    access_type     TEXT,
    instance_owner  TEXT,
    region          TEXT,
    join_time       DATETIME NOT NULL,
    leave_time      DATETIME,
    FOREIGN KEY(session_id) REFERENCES app_sessions(id)
);

CREATE TABLE IF NOT EXISTS players (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         TEXT UNIQUE,
    display_name    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS player_visits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id        INTEGER NOT NULL,
    player_id       INTEGER NOT NULL,
    is_local        BOOLEAN NOT NULL DEFAULT 0,
    join_time       DATETIME NOT NULL,
    leave_time      DATETIME,
    FOREIGN KEY(visit_id) REFERENCES world_visits(id),
    FOREIGN KEY(player_id) REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS avatar_changes (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id          INTEGER NOT NULL,
    player_id         INTEGER,
    display_name_raw  TEXT NOT NULL,
    avatar_name       TEXT NOT NULL,
    timestamp         DATETIME NOT NULL,
    FOREIGN KEY(visit_id) REFERENCES world_visits(id),
    FOREIGN KEY(player_id) REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS video_playbacks (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id          INTEGER NOT NULL,
    player_id         INTEGER,
    display_name_raw  TEXT,
    url               TEXT NOT NULL,
    timestamp         DATETIME NOT NULL,
    FOREIGN KEY(visit_id) REFERENCES world_visits(id),
    FOREIGN KEY(player_id) REFERENCES players(id)
);
";

fn main() -> Result<()> {
    let setting = load_setting();
    let db_path = setting.get_effective_db_path().unwrap_or_else(|_| {
        std::path::PathBuf::from("planetarium.db")
    });
    let tracking = setting.enableUserTracking;

    println!("[Planetarium] DB path: {:?}", db_path);
    println!("[Planetarium] Tracking mode: {}", tracking);

    // §6.4 スキーマ初期化 + WALモード追加 (パフォーマンス問題3の解消)
    let mut conn = Connection::open(&db_path)?;
    conn.execute_batch("PRAGMA journal_mode = WAL;")?;
    conn.execute_batch(SCHEMA)?;

    // コマンドライン引数でモード分岐
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
    // §6.2 通常モード: archivePath 配下の raw ログを差分インポート
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

        // §6.2 log_filename UNIQUE 制約で重複インポートを防止（差分取得の核心）
        let already_processed: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM app_sessions WHERE log_filename = ?1)",
            params![filename],
            |row| row.get(0),
        ).unwrap_or(false);

        if already_processed {
            println!("[Planetarium] スキップ（処理済み）: {}", filename);
            continue;
        }

        println!("[Planetarium] 処理中: {}", filename);
        if let Err(e) = parse_and_import(conn, log_path, &filename, tracking) {
            eprintln!("[Planetarium] エラー ({}): {}", filename, e);
        } else {
            // §6.2 パフォーマンス問題4の解消: 処理成功後に圧縮し元ファイルを削除
            let current_time = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
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
    std::fs::create_dir_all(&tmp_dir).unwrap_or_default();
    
    for (i, zst_path) in zst_files.iter().enumerate() {
        let arch_name = zst_path.file_name().unwrap_or_default().to_string_lossy();
        println!("[Planetarium] {} / {} 処理中: {}", i + 1, total, arch_name);
        
        // zstd 解凍 -> tar 展開
        if let Ok(file) = File::open(&zst_path) {
            if let Ok(decoder) = zstd::stream::Decoder::new(file) {
                let mut archive = tar::Archive::new(decoder);
                
                // tmp_sync に展開
                if archive.unpack(&tmp_dir).is_ok() {
                    // 展開された .txt を探してパース
                    if let Ok(entries) = fs::read_dir(&tmp_dir) {
                        for entry in entries.flatten() {
                            let extracted_path = entry.path();
                            if extracted_path.is_file() && extracted_path.extension().and_then(|e| e.to_str()) == Some("txt") {
                                let filename = extracted_path.file_name().unwrap_or_default().to_string_lossy().to_string();
                                
                                // 重複チェック
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
                                
                                // パース後は削除
                                let _ = fs::remove_file(&extracted_path);
                            }
                        }
                    }
                } else {
                    eprintln!("[Planetarium] tar展開エラー: {}", arch_name);
                }
            }
        }
    }
    
    // tmp_dir を削除
    let _ = fs::remove_dir_all(&tmp_dir);
    
    // UI側のポーリング終了用にわかりやすい完了メッセージ
    println!("[Planetarium] 強制Sync完了");
    Ok(())
}


fn compress_to_tar_zst(log_path: &Path, archive_dir: &Path, timestamp_str: &str) -> std::io::Result<()> {
    let name = format!("{}.tar.zst", timestamp_str);
    let dest_path = archive_dir.join("zip").join(name);
    
    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    
    let tar_zst_file = File::create(&dest_path)?;
    let encoder = zstd::stream::Encoder::new(tar_zst_file, 3)?;
    let mut builder = tar::Builder::new(encoder.auto_finish());
    
    let filename = log_path.file_name().unwrap_or_default().to_str().unwrap_or("log.txt");
    builder.append_path_with_name(log_path, filename)?;
    builder.into_inner()?;
    
    // 元のファイルを削除
    std::fs::remove_file(log_path)?;
    
    Ok(())
}

/// archivePath 配下から output_log_*.txt を収集
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

/// §6.4 / §6.5 / §6.6 — 1ログファイルをパースしてDB登録
fn parse_and_import(
    conn: &mut Connection,
    log_path: &Path,
    filename: &str,
    tracking: bool,
) -> Result<()> {
    // §6.5 パターン一覧
    let re_time = Regex::new(r"^(\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2})").unwrap();
    let re_user_auth = Regex::new(r"User Authenticated: (.*?) \((usr_.*?)\)").unwrap();
    let re_build = Regex::new(r"VRChat Build: (.*)").unwrap();
    let re_entering = Regex::new(r"\[Behaviour\] Entering Room: (.*)").unwrap();
    let re_joining = Regex::new(
        r"\[Behaviour\] Joining (wrld_[^:]+)(?::(\d+))?~?((?:private|friends|hidden|public|group)[^~]*)(?:~region\(([^)]+)\))?"
    ).unwrap();
    let re_left_room = Regex::new(r"\[Behaviour\] OnLeftRoom").unwrap();
    let re_player_join = Regex::new(r"\[Behaviour\] OnPlayerJoined (.*?) \((usr_.*?)\)").unwrap();
    let re_player_left = Regex::new(r"\[Behaviour\] OnPlayerLeft (.*?) \((usr_.*?)\)").unwrap();
    let re_is_local = Regex::new(r#"\[Behaviour\] Initialized PlayerAPI "(.*?)" is (local|remote)"#).unwrap();
    let re_avatar = Regex::new(r"\[Behaviour\] Switching (.*?) to avatar (.*)").unwrap();
    // §6.4.6 USharpVideo は Unity Rich Text タグ付きで出力される
    let re_video = Regex::new(r"\[(?:<[^>]+>)?USharpVideo(?:</[^>]+>)?\] Started video load for URL: (.*?), requested by (.*)").unwrap();
    let re_video_alt = Regex::new(r"\[(?:<[^>]+>)?USharpVideo(?:</[^>]+>)?\] Started video: (.*)").unwrap();

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

    // パフォーマンス問題1: トランザクションを開始してディスクI/Oを激減
    let tx = conn.transaction()?;

    // パフォーマンス問題2: 事前にダミー行をINSERTしてsession_idを取得（全行バッファリングを廃止）
    // 後でファイルの最後で正確なデータにUPDATEする。
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

    // メインパースループ (逐次読み込みに変更)
    for line_result in reader.lines() {
        let line = match line_result {
            Ok(l) => l,
            Err(_) => continue,
        };

        if vrchat_build.is_none() {
            if let Some(caps) = re_build.captures(&line) {
                vrchat_build = Some(caps.get(1).unwrap().as_str().trim().to_string());
            }
        }

        // タイムスタンプ更新
        if let Some(caps) = re_time.captures(&line) {
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

        // §6.5 #2 ユーザー認証
        if let Some(caps) = re_user_auth.captures(&line) {
            if my_display_name.is_none() {
                my_display_name = Some(caps.get(1).unwrap().as_str().to_string());
                if tracking {
                    my_user_id = Some(caps.get(2).unwrap().as_str().to_string());
                }
            }
            continue;
        }

        // §6.5 #4 ワールド入室（名前）
        if let Some(caps) = re_entering.captures(&line) {
            if let Some(vid) = current_visit_id {
                tx.execute("UPDATE world_visits SET leave_time = ?1 WHERE id = ?2 AND leave_time IS NULL", params![ts_str, vid])?;
                tx.execute("UPDATE player_visits SET leave_time = ?1 WHERE visit_id = ?2 AND leave_time IS NULL", params![ts_str, vid])?;
            }
            pending_room_name = Some(caps.get(1).unwrap().as_str().to_string());
            current_visit_id = None;
            continue;
        }

        // §6.5 #5 ワールド入室（ID・インスタンス情報）
        if let Some(caps) = re_joining.captures(&line) {
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

        // §6.5 #6 ワールド退室
        if re_left_room.is_match(&line) {
            if let Some(vid) = current_visit_id {
                tx.execute("UPDATE world_visits SET leave_time = ?1 WHERE id = ?2 AND leave_time IS NULL", params![ts_str, vid])?;
                tx.execute("UPDATE player_visits SET leave_time = ?1 WHERE visit_id = ?2 AND leave_time IS NULL", params![ts_str, vid])?;
                current_visit_id = None;
                pending_room_name = None;
            }
            continue;
        }

        // §6.5 #7 プレイヤー参加
        if let Some(caps) = re_player_join.captures(&line) {
            let dname = caps.get(1).unwrap().as_str();
            let uid = caps.get(2).unwrap().as_str();

            let player_id = if tracking {
                tx.execute(
                    "INSERT INTO players (user_id, display_name) VALUES (?1, ?2)
                     ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name",
                    params![uid, dname],
                )?;
                tx.query_row("SELECT id FROM players WHERE user_id = ?1", params![uid], |row| row.get::<_, i64>(0)).ok()
            } else {
                tx.execute(
                    "INSERT OR IGNORE INTO players (user_id, display_name) VALUES (NULL, ?1)",
                    params![dname],
                )?;
                tx.query_row("SELECT id FROM players WHERE display_name = ?1 AND user_id IS NULL LIMIT 1", params![dname], |row| row.get::<_, i64>(0)).ok()
            };

            if let (Some(vid), Some(pid)) = (current_visit_id, player_id) {
                tx.execute(
                    "INSERT INTO player_visits (visit_id, player_id, is_local, join_time) VALUES (?1, ?2, 0, ?3)",
                    params![vid, pid, ts_str],
                )?;
            }
            continue;
        }

        // §6.5 #8 プレイヤー退出
        if let Some(caps) = re_player_left.captures(&line) {
            let uid = caps.get(2).unwrap().as_str();
            if let Some(vid) = current_visit_id {
                let player_id: Option<i64> = if tracking {
                    tx.query_row("SELECT id FROM players WHERE user_id = ?1", params![uid], |row| row.get(0)).ok()
                } else {
                    let dname = caps.get(1).unwrap().as_str();
                    tx.query_row("SELECT id FROM players WHERE display_name = ?1 AND user_id IS NULL LIMIT 1", params![dname], |row| row.get(0)).ok()
                };
                if let Some(pid) = player_id {
                    tx.execute(
                        "UPDATE player_visits SET leave_time = ?1 WHERE visit_id = ?2 AND player_id = ?3 AND leave_time IS NULL",
                        params![ts_str, vid, pid],
                    )?;
                }
            }
            continue;
        }

        // §6.5 #9 is_local 更新
        if let Some(caps) = re_is_local.captures(&line) {
            let dname = caps.get(1).unwrap().as_str();
            let locality = caps.get(2).unwrap().as_str();
            if locality == "local" {
                if let Some(vid) = current_visit_id {
                    let player_id: Option<i64> = tx.query_row(
                        "SELECT player_id FROM player_visits pv JOIN players p ON pv.player_id = p.id WHERE pv.visit_id = ?1 AND p.display_name = ?2 LIMIT 1",
                        params![vid, dname],
                        |row| row.get(0),
                    ).ok();
                    if let Some(pid) = player_id {
                        tx.execute("UPDATE player_visits SET is_local = 1 WHERE visit_id = ?1 AND player_id = ?2", params![vid, pid])?;
                    }
                }
            }
            continue;
        }

        // §6.5 #10 アバター変更
        if let Some(caps) = re_avatar.captures(&line) {
            if let Some(vid) = current_visit_id {
                let dname = caps.get(1).unwrap().as_str();
                let avatar = caps.get(2).unwrap().as_str();
                let player_id: Option<i64> = tx.query_row(
                    "SELECT id FROM players WHERE display_name = ?1 LIMIT 1",
                    params![dname],
                    |row| row.get(0),
                ).ok();
                tx.execute(
                    "INSERT INTO avatar_changes (visit_id, player_id, display_name_raw, avatar_name, timestamp) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![vid, player_id, dname, avatar, ts_str],
                )?;
            }
            continue;
        }

        // §6.5 #11 動画再生（詳細）
        if let Some(caps) = re_video.captures(&line) {
            if let Some(vid) = current_visit_id {
                let url = caps.get(1).unwrap().as_str();
                let requester = caps.get(2).unwrap().as_str();
                let player_id: Option<i64> = tx.query_row(
                    "SELECT id FROM players WHERE display_name = ?1 LIMIT 1",
                    params![requester],
                    |row| row.get(0),
                ).ok();
                tx.execute(
                    "INSERT INTO video_playbacks (visit_id, player_id, display_name_raw, url, timestamp) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![vid, player_id, requester, url, ts_str],
                )?;
            }
            continue;
        }

        // §6.5 #12 動画再生（簡易）
        if let Some(caps) = re_video_alt.captures(&line) {
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

    // ログ終端でオープン中のワールド/プレイヤーを閉じる
    if let Some(vid) = current_visit_id {
        let last_ts = current_ts.map(|t| t.format("%Y-%m-%d %H:%M:%S").to_string()).unwrap_or_default();
        tx.execute("UPDATE world_visits SET leave_time = ?1 WHERE id = ?2 AND leave_time IS NULL", params![last_ts, vid])?;
        tx.execute("UPDATE player_visits SET leave_time = ?1 WHERE visit_id = ?2 AND leave_time IS NULL", params![last_ts, vid])?;
    }

    // end_time を app_sessions に更新
    let my_uid_stored = if tracking { my_user_id.clone() } else { None };
    tx.execute(
        "UPDATE app_sessions SET start_time = ?1, end_time = ?2, my_user_id = ?3, my_display_name = ?4, vrchat_build = ?5 WHERE log_filename = ?6",
        params![start_time.unwrap_or_default(), end_time, my_uid_stored, my_display_name, vrchat_build, filename]
    )?;

    // すべて正常にいけばコミット
    tx.commit()?;

    Ok(())
}

/// §6.5 #5 インスタンスIDからアクセス種別とオーナーを分解
fn parse_access_type(access_raw: &str, tracking: bool) -> (Option<String>, Option<String>) {
    let lower = access_raw.to_lowercase();
    let access_type = if lower.starts_with("private") {
        Some("private".to_string())
    } else if lower.starts_with("friends") {
        Some("friends".to_string())
    } else if lower.starts_with("hidden") {
        Some("hidden".to_string())
    } else if lower.starts_with("public") {
        Some("public".to_string())
    } else if lower.starts_with("group") {
        Some("group".to_string())
    } else {
        None
    };

    // §6.6 Privacyモードでは instance_owner を NULL にする
    let instance_owner = if tracking {
        let re_usr = Regex::new(r"\((usr_[^)]+)\)").unwrap();
        re_usr.captures(access_raw).and_then(|c| c.get(1)).map(|m| m.as_str().to_string())
    } else {
        None
    };

    (access_type, instance_owner)
}
