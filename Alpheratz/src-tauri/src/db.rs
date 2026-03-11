use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::fs;
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

fn get_alpheratz_install_dir() -> Option<PathBuf> {
    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\CosmoArtsStore\\STELLAProject\\Alpheratz").ok()?;
    let path: String = key.get_value("InstallLocation").ok()?;
    Some(PathBuf::from(path))
}

fn get_stellarecord_install_dir() -> Option<PathBuf> {
    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\CosmoArtsStore\\STELLAProject\\StellaRecord").ok()?;
    let path: String = key.get_value("InstallLocation").ok()?;
    Some(PathBuf::from(path))
}

pub fn get_stellarecord_db_path() -> Option<PathBuf> {
    Some(get_stellarecord_install_dir()?.join("stellarecord.db"))
}

pub fn get_alpheratz_db_path() -> Option<PathBuf> {
    Some(get_alpheratz_install_dir()?.join("alpheratz.db"))
}

pub fn init_alpheratz_db() -> Result<(), String> {
    let conn = Connection::open(get_alpheratz_db_path().ok_or_else(|| "Failed to get DB path".to_string())?).map_err(|e| e.to_string())?;
    
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;"
    ).map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS photos (
            photo_filename  TEXT PRIMARY KEY,
            photo_path      TEXT NOT NULL,
            world_id        TEXT,
            world_name      TEXT,
            timestamp       TEXT NOT NULL,
            memo            TEXT DEFAULT '',
            phash           TEXT
        )",
        [],
    ).map_err(|e| e.to_string())?;

    // Migration for existing databases
    let _ = conn.execute("ALTER TABLE photos ADD COLUMN phash TEXT", []);

    // Create table for identical world and avatar matching embeddings
    conn.execute(
        "CREATE TABLE IF NOT EXISTS photo_embeddings (
            photo_id       TEXT PRIMARY KEY,
            world_emb      BLOB,
            avatar_emb     BLOB,
            world_cluster  INTEGER,
            avatar_cluster INTEGER
        )",
        [],
    ).map_err(|e| e.to_string())?;

    conn.execute("CREATE INDEX IF NOT EXISTS idx_photos_timestamp ON photos(timestamp)", []).map_err(|e| e.to_string())?;
    conn.execute("CREATE INDEX IF NOT EXISTS idx_photos_world_name ON photos(world_name)", []).map_err(|e| e.to_string())?;

    Ok(())
}
use crate::models::PhotoRecord;

pub fn get_photos(
    start_date: Option<String>,
    end_date: Option<String>,
    world_query: Option<String>,
    world_exact: Option<String>
) -> Result<Vec<PhotoRecord>, String> {
    let conn = Connection::open(get_alpheratz_db_path().ok_or_else(|| "Failed to get DB path".to_string())?).map_err(|e| e.to_string())?;
    
    let mut sql = "SELECT photo_filename, photo_path, world_id, world_name, timestamp, memo, phash FROM photos WHERE 1=1".to_string();
    
    if start_date.is_some() { sql.push_str(" AND timestamp >= :start"); }
    if end_date.is_some() { sql.push_str(" AND timestamp <= :end"); }
    if world_query.is_some() { sql.push_str(" AND world_name LIKE :query"); }
    if world_exact.is_some() {
        if world_exact.as_ref().map(|s| s.as_str()) == Some("unknown") {
            sql.push_str(" AND world_name IS NULL");
        } else {
            sql.push_str(" AND world_name = :exact");
        }
    }

    sql.push_str(" ORDER BY timestamp DESC");
    
    let mut results = Vec::new();
    let query_val = world_query.as_ref().map(|w| format!("%{}%", w));
    
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    
    let mut params = Vec::new();
    if let Some(ref s) = start_date { params.push((":start", s as &dyn rusqlite::ToSql)); }
    if let Some(ref e) = end_date { params.push((":end", e as &dyn rusqlite::ToSql)); }
    if let Some(ref q) = query_val { params.push((":query", q as &dyn rusqlite::ToSql)); }
    if let Some(ref x) = world_exact {
        if x != "unknown" {
            params.push((":exact", x as &dyn rusqlite::ToSql));
        }
    }

    let rows = stmt.query_map(params.as_slice(), |row| {
        Ok(PhotoRecord {
            photo_filename: row.get(0)?,
            photo_path: row.get(1)?,
            world_id: row.get(2)?,
            world_name: row.get(3)?,
            timestamp: row.get(4)?,
            memo: row.get(5)?,
            phash: row.get(6)?,
        })
    }).map_err(|e| e.to_string())?;

    for r in rows {
        if let Ok(rec) = r { results.push(rec); }
    }
    Ok(results)
}

pub fn save_photo_memo(filename: &str, memo: &str) -> Result<(), String> {
    let conn = Connection::open(get_alpheratz_db_path().ok_or_else(|| "Failed to get DB path".to_string())?).map_err(|e| e.to_string())?;
    let changed = conn.execute(
        "UPDATE photos SET memo = ?1 WHERE photo_filename = ?2",
        rusqlite::params![memo, filename],
    ).map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err(format!("写真が見つかりません: {}", filename));
    }
    Ok(())
}
