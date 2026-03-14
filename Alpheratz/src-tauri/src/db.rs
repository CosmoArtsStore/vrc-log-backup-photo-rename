use crate::models::PhotoRecord;
use crate::utils::{get_alpheratz_install_dir, get_stella_record_install_dir};
use rusqlite::Connection;
use std::path::PathBuf;

fn get_stella_record_db_path() -> Option<PathBuf> {
    Some(get_stella_record_install_dir()?.join("stellarecord.db"))
}

pub fn get_alpheratz_db_path() -> Option<PathBuf> {
    Some(get_alpheratz_install_dir()?.join("alpheratz.db"))
}

pub fn open_alpheratz_connection() -> Result<Connection, String> {
    let db_path = get_alpheratz_db_path()
        .ok_or_else(|| "Alpheratz DB の保存先を取得できません".to_string())?;
    Connection::open(&db_path)
        .map_err(|e| format!("Alpheratz DB を開けません ({}): {}", db_path.display(), e))
}

fn has_column(conn: &Connection, table_name: &str, column_name: &str) -> Result<bool, String> {
    let pragma_sql = format!("PRAGMA table_info({})", table_name);
    let mut stmt = conn
        .prepare(&pragma_sql)
        .map_err(|e| format!("テーブル情報を確認できません [{}]: {}", pragma_sql, e))?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| format!("列情報を取得できません [{}]: {}", pragma_sql, e))?;

    for row in rows {
        let existing_name =
            row.map_err(|e| format!("列情報の読み取りに失敗しました [{}]: {}", pragma_sql, e))?;
        if existing_name == column_name {
            return Ok(true);
        }
    }
    Ok(false)
}

fn add_column_if_missing(
    conn: &Connection,
    table_name: &str,
    sql: &str,
    column_name: &str,
) -> Result<(), String> {
    if has_column(conn, table_name, column_name)? {
        return Ok(());
    }

    conn.execute(sql, []).map_err(|e| {
        format!(
            "列追加に失敗しました [{} / {}]: {}",
            table_name, column_name, e
        )
    })?;
    Ok(())
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
             memo            TEXT DEFAULT '',
             phash           TEXT,
             orientation     TEXT,
             is_favorite     INTEGER DEFAULT 0,
             match_source    TEXT
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

         CREATE INDEX IF NOT EXISTS idx_photos_timestamp ON photos(timestamp);
         CREATE INDEX IF NOT EXISTS idx_photos_world_name ON photos(world_name);
         CREATE INDEX IF NOT EXISTS idx_photos_is_favorite ON photos(is_favorite);",
    )
    .map_err(|e| format!("Alpheratz DB スキーマ初期化に失敗しました: {}", e))?;

    add_column_if_missing(
        &conn,
        "photos",
        "ALTER TABLE photos ADD COLUMN orientation TEXT",
        "orientation",
    )?;
    add_column_if_missing(
        &conn,
        "photos",
        "ALTER TABLE photos ADD COLUMN is_favorite INTEGER DEFAULT 0",
        "is_favorite",
    )?;
    add_column_if_missing(
        &conn,
        "photos",
        "ALTER TABLE photos ADD COLUMN match_source TEXT",
        "match_source",
    )?;

    // Intentional: pre-release cleanup. We only keep the current schema and remove abandoned tables.
    conn.execute("DROP TABLE IF EXISTS photo_embeddings", [])
        .map_err(|e| format!("不要テーブル photo_embeddings の削除に失敗しました: {}", e))?;

    let _ = get_stella_record_db_path();
    Ok(())
}

pub fn get_photos(
    start_date: Option<String>,
    end_date: Option<String>,
    world_query: Option<String>,
    world_exact: Option<String>,
) -> Result<Vec<PhotoRecord>, String> {
    let conn = open_alpheratz_connection()?;

    let mut sql = "SELECT photo_filename, photo_path, world_id, world_name, timestamp, memo, phash, orientation, is_favorite, match_source FROM photos WHERE 1=1".to_string();

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
        if world_exact.as_deref() == Some("unknown") {
            sql.push_str(" AND world_name IS NULL");
        } else {
            sql.push_str(" AND world_name = :exact");
        }
    }

    sql.push_str(" ORDER BY timestamp DESC");

    let mut stmt = conn
        .prepare(&sql)
        .map_err(|e| format!("写真一覧クエリを準備できません [{}]: {}", sql, e))?;

    let query_val = world_query.as_ref().map(|w| format!("%{}%", w));
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
                orientation: row.get(7)?,
                is_favorite: row.get::<_, i64>(8)? != 0,
                tags: Vec::new(),
                match_source: row.get(9)?,
            })
        })
        .map_err(|e| format!("写真一覧クエリを実行できません: {}", e))?;

    let mut results = Vec::new();
    for row in rows {
        match row {
            Ok(record) => results.push(record),
            Err(err) => crate::utils::log_warn(&format!("photo row decode failed: {}", err)),
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
        .map_err(|e| format!("写真メモを更新できません [{}]: {}", filename, e))?;
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
        .map_err(|e| format!("お気に入り状態を更新できません [{}]: {}", filename, e))?;
    if changed == 0 {
        return Err(format!("写真が見つかりません: {}", filename));
    }
    Ok(())
}

pub fn add_photo_tag(filename: &str, tag: &str) -> Result<(), String> {
    let conn = open_alpheratz_connection()?;
    let tx = conn.unchecked_transaction().map_err(|e| {
        format!(
            "タグ追加トランザクションを開始できません [{}]: {}",
            filename, e
        )
    })?;

    tx.execute(
        "INSERT INTO tags (name) VALUES (?1) ON CONFLICT(name) DO NOTHING",
        rusqlite::params![tag],
    )
    .map_err(|e| format!("タグを追加できません [{}]: {}", tag, e))?;

    tx.execute(
        "INSERT INTO photo_tags (photo_filename, tag_id)
         SELECT ?1, id FROM tags WHERE name = ?2
         ON CONFLICT(photo_filename, tag_id) DO NOTHING",
        rusqlite::params![filename, tag],
    )
    .map_err(|e| {
        format!(
            "写真へタグを関連付けできません [{} / {}]: {}",
            filename, tag, e
        )
    })?;

    tx.commit().map_err(|e| {
        format!(
            "タグ追加トランザクションを確定できません [{}]: {}",
            filename, e
        )
    })?;
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
    .map_err(|e| {
        format!(
            "写真からタグを削除できません [{} / {}]: {}",
            filename, tag, e
        )
    })?;
    Ok(())
}
