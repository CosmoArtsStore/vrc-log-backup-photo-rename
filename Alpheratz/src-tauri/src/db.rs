use std::backtrace::Backtrace;
use std::collections::HashMap;
use std::path::PathBuf;

use rusqlite::{params, params_from_iter, Connection};
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

use crate::models::PhotoRecord;
use crate::utils;

fn get_component_install_dir(candidates: &[&str]) -> Option<PathBuf> {
    let root = RegKey::predef(HKEY_CURRENT_USER);
    for name in candidates {
        let key_path = format!("Software\\CosmoArtsStore\\STELLAProject\\{}", name);
        let key = match root.open_subkey(&key_path) {
            Ok(key) => key,
            Err(err) => {
                utils::log_warn(&format!("registry open failed [{}]: {}", key_path, err));
                continue;
            }
        };
        let path: String = match key.get_value("InstallLocation") {
            Ok(path) => path,
            Err(err) => {
                utils::log_warn(&format!(
                    "registry value read failed [{}\\InstallLocation]: {}",
                    key_path, err
                ));
                continue;
            }
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

pub fn get_alpheratz_db_path() -> Option<PathBuf> {
    Some(get_alpheratz_install_dir()?.join("alpheratz.db"))
}

fn format_db_error(context: &str, err: impl std::fmt::Display) -> String {
    format!(
        "{}: {}\nBacktrace:\n{}",
        context,
        err,
        Backtrace::force_capture()
    )
}

fn warn_row_error<T, E: std::fmt::Display>(row: Result<T, E>, context: &str) -> Option<T> {
    match row {
        Ok(value) => Some(value),
        Err(err) => {
            utils::log_warn(&format!("{}: {}", context, err));
            None
        }
    }
}

pub fn open_alpheratz_connection() -> Result<Connection, String> {
    let db_path = get_alpheratz_db_path().ok_or_else(|| "Failed to get DB path".to_string())?;
    Connection::open(&db_path)
        .map_err(|e| format_db_error(&format!("Failed to open DB at {}", db_path.display()), e))
}

fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
    let sql = format!("PRAGMA table_info({})", table);
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format_db_error(&format!("Failed to inspect table [{}]", table), e))?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| format_db_error(&format!("Failed to query table_info [{}]", table), e))?;

    for row in rows {
        if let Some(name) = warn_row_error(row, "table_info row decode failed") {
            if name == column {
                return Ok(true);
            }
        }
    }

    Ok(false)
}

fn add_column_if_missing(
    conn: &Connection,
    table: &str,
    column: &str,
    sql: &str,
) -> Result<(), String> {
    if column_exists(conn, table, column)? {
        return Ok(());
    }

    conn.execute(sql, [])
        .map(|_| ())
        .map_err(|e| format_db_error(&format!("Failed to add column [{}.{}]", table, column), e))
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
             is_favorite     INTEGER DEFAULT 0,
             match_source    TEXT
         );

         CREATE TABLE IF NOT EXISTS tags (
             id    INTEGER PRIMARY KEY AUTOINCREMENT,
             name  TEXT NOT NULL UNIQUE
         );

         CREATE TABLE IF NOT EXISTS photo_tags (
             photo_filename  TEXT NOT NULL REFERENCES photos(photo_filename) ON DELETE CASCADE,
             tag_id          INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
             PRIMARY KEY (photo_filename, tag_id)
         );

         DROP TABLE IF EXISTS photo_embeddings;

         CREATE INDEX IF NOT EXISTS idx_photos_timestamp ON photos(timestamp);
         CREATE INDEX IF NOT EXISTS idx_photos_world_name ON photos(world_name);
         CREATE INDEX IF NOT EXISTS idx_photos_favorite ON photos(is_favorite);",
    )
    .map_err(|e| format_db_error("Database schema initialization failed", e))?;

    add_column_if_missing(&conn, "photos", "width", "ALTER TABLE photos ADD COLUMN width INTEGER")?;
    add_column_if_missing(
        &conn,
        "photos",
        "height",
        "ALTER TABLE photos ADD COLUMN height INTEGER",
    )?;
    add_column_if_missing(
        &conn,
        "photos",
        "orientation",
        "ALTER TABLE photos ADD COLUMN orientation TEXT",
    )?;
    add_column_if_missing(
        &conn,
        "photos",
        "histogram",
        "ALTER TABLE photos ADD COLUMN histogram BLOB",
    )?;
    add_column_if_missing(
        &conn,
        "photos",
        "is_favorite",
        "ALTER TABLE photos ADD COLUMN is_favorite INTEGER DEFAULT 0",
    )?;
    add_column_if_missing(
        &conn,
        "photos",
        "match_source",
        "ALTER TABLE photos ADD COLUMN match_source TEXT",
    )?;

    Ok(())
}

fn load_tags_for_filenames(
    conn: &Connection,
    filenames: &[String],
) -> Result<HashMap<String, Vec<String>>, String> {
    if filenames.is_empty() {
        return Ok(HashMap::new());
    }

    let placeholders = vec!["?"; filenames.len()].join(", ");
    let sql = format!(
        "SELECT pt.photo_filename, t.name
         FROM photo_tags pt
         JOIN tags t ON t.id = pt.tag_id
         WHERE pt.photo_filename IN ({})
         ORDER BY t.name ASC",
        placeholders
    );

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format_db_error("Failed to prepare tag lookup query", e))?;
    let rows = stmt
        .query_map(params_from_iter(filenames.iter()), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| format_db_error("Failed to execute tag lookup query", e))?;

    let mut map = HashMap::new();
    for row in rows {
        if let Some((filename, tag)) = warn_row_error(row, "tag lookup row decode failed") {
            map.entry(filename).or_insert_with(Vec::new).push(tag);
        }
    }

    Ok(map)
}

pub fn get_photos(
    start_date: Option<String>,
    end_date: Option<String>,
    world_query: Option<String>,
    world_exact: Option<String>,
) -> Result<Vec<PhotoRecord>, String> {
    let conn = open_alpheratz_connection()?;

    let mut sql = "SELECT photo_filename, photo_path, world_id, world_name, timestamp, memo, phash, width, height, orientation, histogram, is_favorite, match_source FROM photos WHERE 1=1".to_string();

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

    let query_val = world_query.as_ref().map(|w| format!("%{}%", w));
    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format_db_error(&format!("Failed to prepare query [{}]", sql), e))?;

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
            let histogram_blob: Option<Vec<u8>> = row.get(10)?;
            let histogram = histogram_blob
                .as_deref()
                .and_then(|bytes| serde_json::from_slice::<Vec<f32>>(bytes).ok());

            Ok(PhotoRecord {
                photo_filename: row.get(0)?,
                photo_path: row.get(1)?,
                world_id: row.get(2)?,
                world_name: row.get(3)?,
                timestamp: row.get(4)?,
                memo: row.get(5)?,
                phash: row.get(6)?,
                width: row.get(7)?,
                height: row.get(8)?,
                orientation: row.get(9)?,
                histogram,
                is_favorite: row.get::<_, i64>(11)? != 0,
                tags: Vec::new(),
                match_source: row.get(12)?,
            })
        })
        .map_err(|e| format_db_error("Failed to execute query", e))?;

    let mut results = Vec::new();
    for row in rows {
        if let Some(record) = warn_row_error(row, "photo row decode failed") {
            results.push(record);
        }
    }

    let filenames: Vec<String> = results
        .iter()
        .map(|record| record.photo_filename.clone())
        .collect();
    let tags_by_filename = load_tags_for_filenames(&conn, &filenames)?;

    for record in &mut results {
        record.tags = tags_by_filename
            .get(&record.photo_filename)
            .cloned()
            .unwrap_or_default();
    }

    Ok(results)
}

pub fn save_photo_memo(filename: &str, memo: &str) -> Result<(), String> {
    let conn = open_alpheratz_connection()?;
    let changed = conn
        .execute(
            "UPDATE photos SET memo = ?1 WHERE photo_filename = ?2",
            params![memo, filename],
        )
        .map_err(|e| format_db_error(&format!("Failed to update memo for {}", filename), e))?;
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
            params![if is_favorite { 1i64 } else { 0i64 }, filename],
        )
        .map_err(|e| format_db_error(&format!("Failed to update favorite for {}", filename), e))?;
    if changed == 0 {
        return Err(format!("写真が見つかりません: {}", filename));
    }
    Ok(())
}

pub fn add_photo_tag(filename: &str, tag: &str) -> Result<(), String> {
    let trimmed = tag.trim();
    if trimmed.is_empty() {
        return Err("タグが空です".to_string());
    }

    let mut conn = open_alpheratz_connection()?;
    let tx = conn
        .transaction()
        .map_err(|e| format_db_error("Failed to start tag transaction", e))?;

    tx.execute(
        "INSERT OR IGNORE INTO tags (name) VALUES (?1)",
        params![trimmed],
    )
    .map_err(|e| format_db_error("Failed to insert tag", e))?;

    let tag_id: i64 = tx
        .query_row("SELECT id FROM tags WHERE name = ?1", params![trimmed], |row| row.get(0))
        .map_err(|e| format_db_error("Failed to resolve tag id", e))?;

    tx.execute(
        "INSERT OR IGNORE INTO photo_tags (photo_filename, tag_id) VALUES (?1, ?2)",
        params![filename, tag_id],
    )
    .map_err(|e| format_db_error("Failed to attach tag to photo", e))?;

    tx.commit()
        .map_err(|e| format_db_error("Failed to commit tag transaction", e))?;
    Ok(())
}

pub fn remove_photo_tag(filename: &str, tag: &str) -> Result<(), String> {
    let conn = open_alpheratz_connection()?;
    conn.execute(
        "DELETE FROM photo_tags
         WHERE photo_filename = ?1
           AND tag_id IN (SELECT id FROM tags WHERE name = ?2)",
        params![filename, tag],
    )
    .map_err(|e| format_db_error("Failed to remove tag from photo", e))?;
    Ok(())
}
