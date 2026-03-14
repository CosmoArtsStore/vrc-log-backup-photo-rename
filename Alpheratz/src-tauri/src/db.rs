use crate::models::PhotoRecord;
use rusqlite::Connection;
use std::path::PathBuf;
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

fn get_component_install_dir(candidates: &[&str]) -> Option<PathBuf> {
    let root = RegKey::predef(HKEY_CURRENT_USER);
    for name in candidates {
        let key_path = format!("Software\\CosmoArtsStore\\STELLAProject\\{}", name);
        let key = match root.open_subkey(&key_path) {
            Ok(key) => key,
            Err(_) => continue,
        };
        let path: String = match key.get_value("InstallLocation") {
            Ok(path) => path,
            Err(_) => continue,
        };
        let path_buf = PathBuf::from(path);
        if path_buf.exists() {
            return Some(path_buf);
        }
    }
    None
}

fn get_alpheratz_install_dir() -> Option<PathBuf> {
    get_component_install_dir(&["Alpheratz"])
}

fn get_stella_record_install_dir() -> Option<PathBuf> {
    get_component_install_dir(&["STELLA_RECORD", "StellaRecord"])
}

pub fn get_stella_record_db_path() -> Option<PathBuf> {
    Some(get_stella_record_install_dir()?.join("stellarecord.db"))
}

pub fn get_alpheratz_db_path() -> Option<PathBuf> {
    Some(get_alpheratz_install_dir()?.join("alpheratz.db"))
}

pub fn open_alpheratz_connection() -> Result<Connection, String> {
    let db_path = get_alpheratz_db_path().ok_or_else(|| "Failed to get DB path".to_string())?;
    Connection::open(&db_path)
        .map_err(|e| format!("Failed to open DB at {}: {}", db_path.display(), e))
}

fn add_column_if_missing(conn: &Connection, sql: &str) -> Result<(), String> {
    match conn.execute(sql, []) {
        Ok(_) => Ok(()),
        Err(err) => {
            let message = err.to_string();
            if message.contains("duplicate column name") {
                Ok(())
            } else {
                Err(message)
            }
        }
    }
}

pub fn init_alpheratz_db() -> Result<(), String> {
    let conn = open_alpheratz_connection()?;

    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         PRAGMA foreign_keys = ON;
         
         CREATE TABLE IF NOT EXISTS photos (
             photo_filename  TEXT PRIMARY KEY,
             photo_path      TEXT NOT NULL,
             world_id        TEXT,
             world_name      TEXT,
             timestamp       TEXT NOT NULL,
             width           INTEGER,
             height          INTEGER,
             orientation     TEXT,
             memo            TEXT DEFAULT '',
             phash           TEXT,
             histogram       BLOB,
             is_favorite     INTEGER DEFAULT 0
         );

         CREATE TABLE IF NOT EXISTS tags (
             id    INTEGER PRIMARY KEY AUTOINCREMENT,
             name  TEXT NOT NULL UNIQUE
         );

         CREATE TABLE IF NOT EXISTS photo_tags (
             photo_filename  TEXT REFERENCES photos(photo_filename),
             tag_id          INTEGER REFERENCES tags(id),
             PRIMARY KEY (photo_filename, tag_id)
         );

         DROP TABLE IF EXISTS photo_embeddings;

         CREATE INDEX IF NOT EXISTS idx_photos_timestamp ON photos(timestamp);
         CREATE INDEX IF NOT EXISTS idx_photos_world_name ON photos(world_name);",
    )
    .map_err(|e| format!("Database schema initialization failed: {}", e))?;

    add_column_if_missing(&conn, "ALTER TABLE photos ADD COLUMN width INTEGER")?;
    add_column_if_missing(&conn, "ALTER TABLE photos ADD COLUMN height INTEGER")?;
    add_column_if_missing(&conn, "ALTER TABLE photos ADD COLUMN orientation TEXT")?;
    add_column_if_missing(&conn, "ALTER TABLE photos ADD COLUMN histogram BLOB")?;
    add_column_if_missing(
        &conn,
        "ALTER TABLE photos ADD COLUMN is_favorite INTEGER DEFAULT 0",
    )?;

    Ok(())
}

pub fn get_photos(
    start_date: Option<String>,
    end_date: Option<String>,
    world_query: Option<String>,
    world_exact: Option<String>,
) -> Result<Vec<PhotoRecord>, String> {
    let conn = open_alpheratz_connection()?;

    let mut sql = "SELECT photo_filename, photo_path, world_id, world_name, timestamp, memo, phash FROM photos WHERE 1=1".to_string();

    if start_date.is_some() {
        sql.push_str(" AND timestamp >= :start");
    }
    if end_date.is_some() {
        sql.push_str(" AND timestamp <= :end");
    }
    if world_query.is_some() {
        sql.push_str(" AND world_name LIKE :query");
    }
    if world_exact.is_some() {
        if world_exact.as_ref().map(|s| s.as_str()) == Some("unknown") {
            sql.push_str(" AND world_name IS NULL");
        } else {
            sql.push_str(" AND world_name = :exact");
        }
    }

    sql.push_str(" ORDER BY timestamp DESC");

    let row_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM photos", [], |row| row.get(0))
        .map_err(|e| format!("Failed to count photos: {}", e))?;
    let mut results = Vec::with_capacity((row_count.max(0) as usize).min(2_000));
    let query_val = world_query.as_ref().map(|w| format!("%{}%", w));

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("Failed to prepare query [{}]: {}", sql, e))?;

    let mut params = Vec::new();
    if let Some(ref s) = start_date {
        params.push((":start", s as &dyn rusqlite::ToSql));
    }
    if let Some(ref e) = end_date {
        params.push((":end", e as &dyn rusqlite::ToSql));
    }
    if let Some(ref q) = query_val {
        params.push((":query", q as &dyn rusqlite::ToSql));
    }
    if let Some(ref x) = world_exact {
        if x != "unknown" {
            params.push((":exact", x as &dyn rusqlite::ToSql));
        }
    }

    let rows = stmt
        .query_map(params.as_slice(), |row| {
            Ok(PhotoRecord {
                photo_filename: row.get(0)?,
                photo_path: row.get(1)?,
                world_id: row.get(2)?,
                world_name: row.get(3)?,
                timestamp: row.get(4)?,
                memo: row.get(5)?,
                phash: row.get(6)?,
                width: None,
                height: None,
                orientation: None,
                histogram: None,
                is_favorite: false,
                tags: Vec::new(),
                match_source: None,
            })
        })
        .map_err(|e| format!("Failed to execute query: {}", e))?;

    for r in rows {
        if let Ok(rec) = r {
            results.push(rec);
        }
    }
    Ok(results)
}

pub fn save_photo_memo(filename: &str, memo: &str) -> Result<(), String> {
    let conn = open_alpheratz_connection()?;
    let changed = conn
        .execute(
            "UPDATE photos SET memo = ?1 WHERE photo_filename = ?2",
            rusqlite::params![memo, filename],
        )
        .map_err(|e| format!("Failed to update memo for {}: {}", filename, e))?;
    if changed == 0 {
        return Err(format!("写真が見つかりません: {}", filename));
    }
    Ok(())
}

pub fn set_photo_favorite(filename: &str, is_favorite: bool) -> Result<(), String> {
    let conn = open_alpheratz_connection()?;
    let changed = conn
        .execute(
            "UPDATE photos SET is_favorite = ?1 WHERE photo_filename = ?2",
            rusqlite::params![if is_favorite { 1 } else { 0 }, filename],
        )
        .map_err(|e| format!("Failed to update favorite for {}: {}", filename, e))?;
    if changed == 0 {
        return Err(format!("写真が見つかりません: {}", filename));
    }
    Ok(())
}

pub fn add_photo_tag(filename: &str, tag: &str) -> Result<(), String> {
    let conn = open_alpheratz_connection()?;
    let tx = conn
        .unchecked_transaction()
        .map_err(|e| format!("Failed to start tag transaction for {}: {}", filename, e))?;

    tx.execute(
        "INSERT INTO tags (name) VALUES (?1) ON CONFLICT(name) DO NOTHING",
        rusqlite::params![tag],
    )
    .map_err(|e| format!("Failed to insert tag [{}]: {}", tag, e))?;

    tx.execute(
        "INSERT INTO photo_tags (photo_filename, tag_id)
         SELECT ?1, id FROM tags WHERE name = ?2
         ON CONFLICT(photo_filename, tag_id) DO NOTHING",
        rusqlite::params![filename, tag],
    )
    .map_err(|e| format!("Failed to link tag [{}] to {}: {}", tag, filename, e))?;

    tx.commit()
        .map_err(|e| format!("Failed to commit tag transaction for {}: {}", filename, e))?;
    Ok(())
}

pub fn remove_photo_tag(filename: &str, tag: &str) -> Result<(), String> {
    let conn = open_alpheratz_connection()?;
    conn.execute(
        "DELETE FROM photo_tags
         WHERE photo_filename = ?1
           AND tag_id IN (SELECT id FROM tags WHERE name = ?2)",
        rusqlite::params![filename, tag],
    )
    .map_err(|e| format!("Failed to remove tag [{}] from {}: {}", tag, filename, e))?;
    Ok(())
}
