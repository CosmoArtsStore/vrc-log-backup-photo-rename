#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod config;

use config::{load_setting, save_setting, AlpheratzSetting};
use regex::Regex;
use rusqlite::{params, Connection, Result as SqlResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use image::imageops::FilterType;

#[derive(Debug, Serialize, Deserialize, Clone)]
struct PhotoRecord {
    photo_filename: String,
    photo_path: String,
    world_id: Option<String>,
    world_name: Option<String>,
    timestamp: String,
    memo: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct WorldInfo {
    world_name: String,
    world_id: String,
}

// --- DB Helper ---

fn get_planetarium_db_path() -> Option<PathBuf> {
    let local = std::env::var("LOCALAPPDATA").ok()?;
    let setting_path = Path::new(&local).join("CosmoArtsStore\\STELLARECORD\\setting\\PlanetariumSetting.json");
    if let Ok(content) = fs::read_to_string(setting_path) {
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(p) = val["dbPath"].as_str() {
                if !p.is_empty() { return Some(PathBuf::from(p)); }
            }
        }
    }
    Some(Path::new(&local).join("CosmoArtsStore\\STELLARECORD\\app\\Planetarium\\planetarium.db"))
}

fn get_alpheratz_db_path() -> PathBuf {
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let dir = Path::new(&local).join("CosmoArtsStore\\STELLARECORD\\app\\Alpheratz");
    let _ = fs::create_dir_all(&dir);
    dir.join("Alpheratz.db")
}

/// §7.8 Alpheratz.db スキーマ
fn init_alpheratz_db() -> SqlResult<()> {
    let conn = Connection::open(get_alpheratz_db_path())?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS photos (
            photo_filename  TEXT PRIMARY KEY,
            photo_path      TEXT NOT NULL,
            world_id        TEXT,
            world_name      TEXT,
            timestamp       TEXT NOT NULL,
            memo            TEXT DEFAULT ''
        )",
        [],
    )?;
    Ok(())
}

// --- Commands ---

#[tauri::command]
async fn scan_photos() -> Result<Vec<PhotoRecord>, String> {
    let setting = load_setting();
    let photo_dir = if setting.photoFolderPath.is_empty() {
        let appdata = std::env::var("APPDATA").map_err(|_| "APPDATA not found")?;
        Path::new(&appdata).join("..\\LocalLow\\VRChat\\VRChat")
    } else {
        PathBuf::from(&setting.photoFolderPath)
    };

    if !photo_dir.exists() {
        return Err("写真フォルダが見つかりません。".to_string());
    }

    // §7.4 パス一括更新ロジックの簡易実装
    // (実際には scan ごとに 整合性を取るのがシンプル)
    
    let re_photo = Regex::new(r"VRChat_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.(\d{3})_(\d+)x(\d+)").unwrap();
    let mut conn = Connection::open(get_alpheratz_db_path()).map_err(|e| e.to_string())?;
    
    // Planetarium.db 接続 (読み取り専用)
    let plan_db = get_planetarium_db_path().ok_or("Planetarium DBが見つかりません")?;
    let plan_conn = Connection::open_with_flags(plan_db, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY).ok();

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    if let Ok(entries) = fs::read_dir(&photo_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if let Some(caps) = re_photo.captures(filename) {
                    let ts_log = format!("{} {}", &caps[1], caps[2].replace("-", ":"));
                    
                    // DBに存在するかチェック
                    let exists: bool = tx.query_row(
                        "SELECT EXISTS(SELECT 1 FROM photos WHERE photo_filename = ?1)",
                        params![filename],
                        |row| row.get(0)
                    ).unwrap_or(false);

                    if !exists {
                        // 新規登録
                        let mut world_id = None;
                        let mut world_name = Some("ワールド不明".to_string());

                        if let Some(ref pconn) = plan_conn {
                            let info: Option<(String, String)> = pconn.query_row(
                                "SELECT world_name, world_id FROM world_visits 
                                 WHERE join_time <= ?1 AND (leave_time IS NULL OR leave_time >= ?1)
                                 ORDER BY join_time DESC LIMIT 1",
                                params![ts_log],
                                |row| Ok((row.get(0)?, row.get(1)?))
                            ).ok();
                            if let Some((wn, wid)) = info {
                                world_name = Some(wn);
                                world_id = Some(wid);
                            }
                        }

                        tx.execute(
                            "INSERT INTO photos (photo_filename, photo_path, world_id, world_name, timestamp)
                             VALUES (?1, ?2, ?3, ?4, ?5)",
                            params![filename, path.to_string_lossy(), world_id, world_name, ts_log]
                        ).map_err(|e| e.to_string())?;
                    } else {
                        // §7.4 パスが違う場合は更新
                        tx.execute(
                            "UPDATE photos SET photo_path = ?1 WHERE photo_filename = ?2 AND photo_path != ?1",
                            params![path.to_string_lossy(), filename]
                        ).map_err(|e| e.to_string())?;
                    }
                }
            }
        }
    }
    tx.commit().map_err(|e| e.to_string())?;

    // 全件取得
    let mut stmt = conn.prepare("SELECT photo_filename, photo_path, world_id, world_name, timestamp, memo FROM photos ORDER BY timestamp DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(PhotoRecord {
            photo_filename: row.get(0)?,
            photo_path: row.get(1)?,
            world_id: row.get(2)?,
            world_name: row.get(3)?,
            timestamp: row.get(4)?,
            memo: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for r in rows {
        results.push(r.map_err(|e| e.to_string())?);
    }
    Ok(results)
}

#[tauri::command]
async fn create_thumbnail(path: String) -> Result<String, String> {
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    // §7.5 thumbnail_cache/ に保存
    let cache_dir = Path::new(&local).join("CosmoArtsStore\\STELLARECORD\\app\\Alpheratz\\thumbnail_cache");
    let _ = fs::create_dir_all(&cache_dir);

    let filename = Path::new(&path).file_name().and_then(|n| n.to_str()).unwrap_or("tmp.png");
    let cache_path = cache_dir.join(format!("{}.thumb.jpg", filename));

    if cache_path.exists() {
        return Ok(cache_path.to_string_lossy().to_string());
    }

    let img = image::open(&path).map_err(|e| e.to_string())?;
    let thumb = img.resize(400, 400, FilterType::Triangle);
    thumb.save(&cache_path).map_err(|e| e.to_string())?;

    Ok(cache_path.to_string_lossy().to_string())
}

#[tauri::command]
async fn save_photo_memo(filename: String, memo: String) -> Result<(), String> {
    let conn = Connection::open(get_alpheratz_db_path()).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE photos SET memo = ?1 WHERE photo_filename = ?2",
        params![memo, filename],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_setting_cmd() -> AlpheratzSetting {
    load_setting()
}

#[tauri::command]
fn save_setting_cmd(setting: AlpheratzSetting) -> Result<(), String> {
    save_setting(&setting)
}

fn main() {
    let _ = init_alpheratz_db();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_setting_cmd,
            save_setting_cmd,
            scan_photos,
            create_thumbnail,
            save_photo_memo,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
