# Alpheratz src-tauri Bundle

生成元: `F:/DEVELOPFOLDER/STELLAProject/Alpheratz/src-tauri`

---

## FILE: build.rs

`$ext
fn main() {
    tauri_build::build()
}
```

---

## FILE: capabilities\default.json

`$ext
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": [
    "main"
  ],
  "permissions": [
    "core:default",
    "fs:default",
    "dialog:default",
    "fs:read-all"
  ]
}
```

---

## FILE: Cargo.toml

`$ext
[package]
name = "alpheratz"
version = "0.1.0"
description = "Alpheratz — Photo manager for STELLAProject Ecosystem"
authors = ["CosmoArtsStore"]
edition = "2021"

[lib]
name = "alpheratz_lib"
crate-type = ["staticlib", "cdylib", "rlib"]

[build-dependencies]
tauri-build = { version = "2.0.5", features = [] }

[dependencies]
tauri = { version = "2.2.4", features = ["protocol-asset"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
regex = "1"
chrono = { version = "0.4", features = ["serde"] }
rusqlite = { version = "0.38", features = ["bundled"] }
tauri-plugin-dialog = "2.2.0"
tauri-plugin-fs = "2.2.0"
image = "0.25.9"
tokio = "1.49.0"
windows = { version = "0.58", features = ["Win32_Foundation", "Win32_UI_WindowsAndMessaging"] }
image_hasher = "3.1.1"
base64 = "0.22.1"
winreg = "0.52"
opener = { version = "0.8", features = ["reveal"] }
directories = "5.0.1"
path-slash = "0.2.1"
```

---

## FILE: migrations\V1__initial_schema.sql

`$ext
-- V1: Initial schema for Alpheratz
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

CREATE INDEX IF NOT EXISTS idx_photos_timestamp ON photos(timestamp);
CREATE INDEX IF NOT EXISTS idx_photos_world_name ON photos(world_name);
```

---

## FILE: rust-toolchain.toml

`$ext
[toolchain]
channel = "1.93.0"
```

---

## FILE: src\config.rs

`$ext
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

use crate::utils;

fn get_alpheratz_install_dir() -> Option<PathBuf> {
    let root = RegKey::predef(HKEY_CURRENT_USER);
    let key = match root.open_subkey("Software\\CosmoArtsStore\\STELLAProject\\Alpheratz") {
        Ok(key) => key,
        Err(err) => {
            utils::log_warn(&format!(
                "registry open failed [Software\\CosmoArtsStore\\STELLAProject\\Alpheratz]: {}",
                err
            ));
            return None;
        }
    };
    let path: String = match key.get_value("InstallLocation") {
        Ok(path) => path,
        Err(err) => {
            utils::log_warn(&format!(
                "registry value read failed [Software\\CosmoArtsStore\\STELLAProject\\Alpheratz\\InstallLocation]: {}",
                err
            ));
            return None;
        }
    };
    let path_buf = PathBuf::from(path);
    if path_buf.exists() {
        Some(path_buf)
    } else {
        utils::log_warn(&format!(
            "install dir does not exist: {}",
            path_buf.display()
        ));
        None
    }
}

/// 仕様書 §8.4 AlpheratzSetting.json
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AlpheratzSetting {
    #[serde(default, rename = "photoFolderPath")]
    pub photo_folder_path: String,
}

impl Default for AlpheratzSetting {
    fn default() -> Self {
        AlpheratzSetting {
            photo_folder_path: String::new(),
        }
    }
}

fn get_setting_path() -> Option<PathBuf> {
    Some(get_alpheratz_install_dir()?.join("alpheratz.json"))
}

pub fn load_setting() -> AlpheratzSetting {
    if let Some(path) = get_setting_path() {
        if path.exists() {
            match fs::read_to_string(&path) {
                Ok(content) => match serde_json::from_str::<AlpheratzSetting>(&content) {
                    Ok(s) => return s,
                    Err(err) => {
                        utils::log_warn(&format!(
                            "Failed to parse settings JSON ({}): {}",
                            path.display(),
                            err
                        ));
                    }
                },
                Err(err) => {
                    utils::log_warn(&format!(
                        "Failed to read settings file ({}): {}",
                        path.display(),
                        err
                    ));
                }
            }
        }
    }
    AlpheratzSetting::default()
}

pub fn save_setting(s: &AlpheratzSetting) -> Result<(), String> {
    let path = get_setting_path().ok_or_else(|| "Failed to get setting path".to_string())?;
    let content = serde_json::to_string_pretty(s).map_err(|e| format!("Serialize error: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("Write error ({}): {}", path.display(), e))?;
    Ok(())
}
```

---

## FILE: src\db.rs

`$ext
use rusqlite::Connection;
use std::backtrace::Backtrace;
use std::path::PathBuf;
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

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

fn add_column_if_missing(conn: &Connection, sql: &str) -> Result<(), String> {
    match conn.execute(sql, []) {
        Ok(_) => Ok(()),
        Err(err) => {
            let message = err.to_string();
            if message.contains("duplicate column name") {
                Ok(())
            } else {
                Err(format_db_error("Failed to alter schema", err))
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
    .map_err(|e| format_db_error("Database schema initialization failed", e))?;

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
use crate::models::PhotoRecord;

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

    let row_count: usize = conn
        .query_row("SELECT COUNT(*) FROM photos", [], |row| row.get(0))
        .map_err(|e| format_db_error("Failed to count photos", e))?;
    let mut results = Vec::with_capacity(row_count.min(2_000));
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
            Ok(PhotoRecord {
                photo_filename: row.get(0)?,
                photo_path: row.get(1)?,
                world_id: row.get(2)?,
                world_name: row.get(3)?,
                timestamp: row.get(4)?,
                memo: row.get(5)?,
                phash: row.get(6)?,
            })
        })
        .map_err(|e| format_db_error("Failed to execute query", e))?;

    for r in rows {
        if let Some(rec) = warn_row_error(r, "photo row decode failed") {
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
        .map_err(|e| format_db_error(&format!("Failed to update memo for {}", filename), e))?;
    if changed == 0 {
        return Err(format!("写真が見つかりません: {}", filename));
    }
    Ok(())
}
```

---

## FILE: src\lib.rs

`$ext
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{generate_handler, AppHandle, Builder, State};

pub struct ScanCancelStatus(pub AtomicBool);

pub mod config;
pub mod db;
pub mod models;
pub mod scanner;
pub mod utils;

use config::{load_setting, save_setting, AlpheratzSetting};
use db::init_alpheratz_db;
use models::PhotoRecord;

// --- Commands ---

#[tauri::command]
async fn cancel_scan(cancel_status: State<'_, ScanCancelStatus>) -> Result<(), String> {
    cancel_status.0.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
async fn initialize_scan(
    app: AppHandle,
    cancel_status: State<'_, ScanCancelStatus>,
) -> Result<(), String> {
    cancel_status.0.store(false, Ordering::SeqCst);
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = scanner::do_scan(app_clone.clone()).await {
            crate::utils::log_err(&format!("Scanner Error: {}", e));
        }

        if let Err(e) = scanner::compute_missing_phashes_bg(app_clone).await {
            crate::utils::log_err(&format!("Phash BG Error: {}", e));
        }
    });
    Ok(())
}

#[tauri::command]
async fn get_photos(
    start_date: Option<String>,
    end_date: Option<String>,
    world_query: Option<String>,
    world_exact: Option<String>,
) -> Result<Vec<PhotoRecord>, String> {
    db::get_photos(start_date, end_date, world_query, world_exact)
}

#[tauri::command]
async fn create_thumbnail(path: String) -> Result<String, String> {
    utils::create_thumbnail_file(&path)
}

#[tauri::command]
async fn save_photo_memo_cmd(filename: String, memo: String) -> Result<(), String> {
    db::save_photo_memo(&filename, &memo)
}

#[tauri::command]
async fn show_in_explorer(path: String) -> Result<(), String> {
    opener::reveal(path).map_err(|e| format!("Failed to reveal path in explorer: {}", e))
}

#[tauri::command]
async fn get_rotated_phashes(path: String) -> Result<Vec<String>, String> {
    use base64::{engine::general_purpose, Engine as _};

    let img = image::open(&path).map_err(|e| {
        format!(
            "Failed to open image for rotated pHash ({}): {}",
            path, e
        )
    })?;
    let mut hashes = Vec::new();
    let hasher = image_hasher::HasherConfig::new().to_hasher();

    hashes.push(hasher.hash_image(&img).to_base64());

    let rot90 = img.rotate90();
    hashes.push(hasher.hash_image(&rot90).to_base64());

    let rot180 = img.rotate180();
    hashes.push(hasher.hash_image(&rot180).to_base64());

    let rot270 = img.rotate270();
    hashes.push(hasher.hash_image(&rot270).to_base64());

    Ok(hashes)
}

#[tauri::command]
fn get_setting_cmd() -> AlpheratzSetting {
    load_setting()
}

#[tauri::command]
fn save_setting_cmd(setting: AlpheratzSetting) -> Result<(), String> {
    save_setting(&setting)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(err) = init_alpheratz_db() {
        utils::log_err(&format!("Database initialization failed: {}", err));
    }

    let run_result = Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ScanCancelStatus(AtomicBool::new(false)))
        .invoke_handler(generate_handler![
            get_setting_cmd,
            save_setting_cmd,
            initialize_scan,
            cancel_scan,
            get_photos,
            create_thumbnail,
            save_photo_memo_cmd,
            show_in_explorer,
            get_rotated_phashes,
        ])
        .run(tauri::generate_context!());

    if let Err(err) = run_result {
        utils::log_err(&format!("Tauri runtime failed: {}", err));
    }
}
```

---

## FILE: src\main.rs

`$ext
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::panic;
use std::process;

/// Windowsネイティブのメッセージボックスを表示する
#[cfg(target_os = "windows")]
fn show_fatal_error(msg: &str) {
    use windows::core::PCWSTR;
    use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

    let title: Vec<u16> = "Alpheratz 致命的エラー\0".encode_utf16().collect();
    let message: Vec<u16> = format!("{msg}\0").encode_utf16().collect();

    // SAFETY: static UTF-16 buffers are null-terminated and valid for MessageBoxW call duration.
    unsafe {
        MessageBoxW(
            None,
            PCWSTR(message.as_ptr()),
            PCWSTR(title.as_ptr()),
            MB_OK | MB_ICONERROR,
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn show_fatal_error(msg: &str) {
    // Intentional no-op: this app targets Windows-only (VRC users), so non-Windows builds are unsupported.
}

fn main() {
    // 1. パニックフックの設定
    // リリースビルド（Windowsサブシステム）でのサイレントクラッシュを防止
    panic::set_hook(Box::new(|info| {
        let location = match info.location() {
            Some(l) => format!("at {}:{}", l.file(), l.line()),
            None => String::new(),
        };

        let payload = info.payload();
        let payload_msg = if let Some(s) = payload.downcast_ref::<&'static str>() {
            s.to_string()
        } else if let Some(s) = payload.downcast_ref::<String>() {
            s.clone()
        } else {
            "致命的なエラーが発生しました。".to_string()
        };

        let error_msg = format!(
            "STELLAProject (Alpheratz) で致命的なエラーが発生しました。\n\nエラー内容: {}\n発生場所: {}\n\nアプリケーションを終了します。\n詳細はインストール先の info.log を確認してください。",
            payload_msg, location
        );

        // クラッシュログの書き出し
        alpheratz_lib::utils::log_err(&error_msg);

        // ユーザーへの通知
        show_fatal_error(&error_msg);
    }));

    // 2. アプリケーションの実行
    // 戻り値のない run() だが、内部でのパニックは上記のフックで捕捉される
    alpheratz_lib::run();

    // 正常終了
    process::exit(0);
}
```

---

## FILE: src\models.rs

`$ext
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PhotoRecord {
    pub photo_filename: String,
    pub photo_path: String,
    pub world_id: Option<String>,
    pub world_name: Option<String>,
    pub timestamp: String,
    #[serde(default)]
    pub memo: String,
    pub phash: Option<String>,
}

impl Default for PhotoRecord {
    fn default() -> Self {
        Self {
            photo_filename: String::new(),
            photo_path: String::new(),
            world_id: None,
            world_name: None,
            timestamp: String::new(),
            memo: String::new(),
            phash: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScanProgress {
    pub processed: usize,
    pub total: usize,
    pub current_world: String,
}
```

---

## FILE: src\scanner.rs

`$ext
use std::collections::HashSet;
use std::fs;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::sync::LazyLock;

use path_slash::PathExt;
use regex::Regex;
use rusqlite::{params, Connection};
use tauri::{AppHandle, Emitter, Manager};

use crate::config::load_setting;
use crate::db::open_alpheratz_connection;
use crate::models::ScanProgress;
use crate::ScanCancelStatus;

const SUPPORTED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp"];
const PHASH_BATCH_SIZE: usize = 50;
const PHOTO_INSERT_BATCH_SIZE: usize = 50;
const MAX_ITXT_SIZE: usize = 4 * 1024 * 1024;
const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "vendor",
    "cache",
    "$recycle.bin",
    "system volume information",
    "thumbnails",
];

fn compile_regex(pattern: &str, name: &str) -> Regex {
    match Regex::new(pattern) {
        Ok(re) => re,
        Err(err) => {
            crate::utils::log_err(&format!("Invalid regex {name}: {err}"));
            // Intentional: fallback regex is static; failure here means process cannot safely continue.
            Regex::new(r"^$").expect("fallback regex must be valid")
        }
    }
}

fn emit_warn<T: serde::Serialize>(app: &AppHandle, event: &str, payload: T) {
    if let Err(err) = app.emit(event, payload) {
        crate::utils::log_warn(&format!("emit failed [{}]: {}", event, err));
    }
}

fn scan_err<E: std::fmt::Display>(context: &str, err: E) -> String {
    format!("{}: {}", context, err)
}

fn warn_row_error<T, E: std::fmt::Display>(row: Result<T, E>, context: &str) -> Option<T> {
    match row {
        Ok(value) => Some(value),
        Err(err) => {
            crate::utils::log_warn(&format!("{}: {}", context, err));
            None
        }
    }
}

static RE_COLLECT: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(
        r"(?i)^VRChat_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.\d{3}",
        "RE_COLLECT",
    )
});
static RE_PARSE: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(
        r"VRChat_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2}-\d{2})\.(\d{3})",
        "RE_PARSE",
    )
});
static RE_ID: LazyLock<Regex> =
    LazyLock::new(|| compile_regex(r"<vrc:WorldID>([^<]+)</vrc:WorldID>", "RE_ID"));
static RE_NAME: LazyLock<Regex> = LazyLock::new(|| {
    compile_regex(
        r"<vrc:WorldDisplayName>([^<]+)</vrc:WorldDisplayName>",
        "RE_NAME",
    )
});

pub async fn do_scan(app: AppHandle) -> Result<(), String> {
    let setting = load_setting();
    let photo_dir = if setting.photo_folder_path.is_empty() {
        default_photo_dir()
    } else {
        Some(PathBuf::from(&setting.photo_folder_path))
    };

    let photo_dir = match photo_dir {
        Some(path) if path.exists() => path,
        _ => {
            emit_warn(&app, "scan:error", "Photo folder not found");
            return Err("Folder not found".into());
        }
    };

    let mut conn = open_alpheratz_connection()?;
    let cancel_status = app.state::<ScanCancelStatus>();
    emit_warn(
        &app,
        "scan:progress",
        ScanProgress {
            processed: 0,
            total: 0,
            current_world: "Collecting files...".into(),
        },
    );

    let existing_files = get_existing_filenames(&conn)?;
    let mut found_files = Vec::new();
    collect_photos_recursive(&photo_dir, &mut found_files, &RE_COLLECT, &cancel_status);

    if cancel_status.0.load(Ordering::SeqCst) {
        crate::utils::log_warn("Scan cancelled during collection.");
        emit_warn(&app, "scan:error", "Scan cancelled");
        return Ok(());
    }

    let mut new_files: Vec<(String, PathBuf)> = found_files
        .into_iter()
        .filter(|(name, _)| !existing_files.contains(name))
        .collect();
    new_files.sort_by(|a, b| b.0.cmp(&a.0));

    let total = new_files.len();
    emit_warn(
        &app,
        "scan:progress",
        ScanProgress {
            processed: 0,
            total,
            current_world: format!("{} new files", total),
        },
    );

    if total > 0 {
        let mut insert_batch: Vec<(
            String,
            PathBuf,
            Option<String>,
            Option<String>,
            String,
            Option<String>,
        )> = Vec::with_capacity(PHOTO_INSERT_BATCH_SIZE);

        for (i, (filename, path)) in new_files.into_iter().enumerate() {
            if cancel_status.0.load(Ordering::SeqCst) {
                crate::utils::log_warn("Scan cancelled by user.");
                emit_warn(&app, "scan:error", "Scan cancelled");
                return Ok(());
            }

            if let Some(caps) = RE_PARSE.captures(&filename) {
                let timestamp = format!("{} {}", &caps[1], caps[2].replace("-", ":"));
                let (world_name, world_id) = resolve_world_info(&filename, &path);
                let current_world = world_name
                    .clone()
                    .unwrap_or_else(|| "Unknown world".to_string());

                insert_batch.push((filename, path, world_id, world_name, timestamp, None));

                if insert_batch.len() >= PHOTO_INSERT_BATCH_SIZE {
                    upsert_photo_batch(&mut conn, &insert_batch)?;
                    insert_batch.clear();
                }

                if i % 10 == 0 || i == total - 1 {
                    emit_warn(
                        &app,
                        "scan:progress",
                        ScanProgress {
                            processed: i + 1,
                            total,
                            current_world,
                        },
                    );
                }
            }
        }

        if !insert_batch.is_empty() {
            upsert_photo_batch(&mut conn, &insert_batch)?;
        }
    }

    backfill_missing_world_info(&conn)?;
    emit_warn(&app, "scan:completed", ());
    Ok(())
}

pub async fn compute_missing_phashes_bg(app: AppHandle) -> Result<(), String> {
    let mut conn = open_alpheratz_connection()?;
    let mut stmt = conn
        .prepare("SELECT photo_filename, photo_path FROM photos WHERE phash IS NULL")
        .map_err(|e| scan_err("Failed to prepare pHash select", e))?;

    let rows: Vec<(String, String)> = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| scan_err("Failed to execute pHash select", e))?
        .filter_map(|row| warn_row_error(row, "phash row decode failed"))
        .collect();

    if rows.is_empty() {
        return Ok(());
    }

    emit_warn(&app, "scan:phash_start", rows.len());
    let mut update_batch: Vec<(String, String)> = Vec::with_capacity(PHASH_BATCH_SIZE);

    for (filename, path_str) in rows {
        if app.state::<ScanCancelStatus>().0.load(Ordering::SeqCst) {
            crate::utils::log_warn("Background pHash generation cancelled.");
            break;
        }

        let path = PathBuf::from(path_str);
        let computed = tauri::async_runtime::spawn_blocking(move || {
            let hasher = image_hasher::HasherConfig::new().to_hasher();
            image::open(&path)
                .map(|img| hasher.hash_image(&img).to_base64())
                .map_err(|e| scan_err("Failed to open image for pHash", e))
        })
        .await
        .map_err(|e| format!("pHash task join error: {}", e))?;

        match computed {
            Ok(phash) => {
                update_batch.push((phash, filename));
                if update_batch.len() >= PHASH_BATCH_SIZE {
                    apply_phash_updates(&mut conn, &update_batch)?;
                    update_batch.clear();
                }
            }
            Err(err) => {
                crate::utils::log_warn(&format!("Failed to compute pHash: {}", err));
            }
        }
    }

    if !update_batch.is_empty() {
        apply_phash_updates(&mut conn, &update_batch)?;
    }

    emit_warn(&app, "scan:completed", ());
    Ok(())
}

fn default_photo_dir() -> Option<PathBuf> {
    let user_dirs = directories::UserDirs::new()?;
    Some(user_dirs.picture_dir()?.join("VRChat"))
}

fn get_existing_filenames(conn: &Connection) -> Result<HashSet<String>, String> {
    let mut stmt = conn
        .prepare("SELECT photo_filename FROM photos")
        .map_err(|e| scan_err("Failed to prepare existing filename query", e))?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| scan_err("Failed to execute existing filename query", e))?;
    let mut set = HashSet::new();
    for row in rows {
        if let Some(filename) = warn_row_error(row, "existing filename row decode failed") {
            set.insert(filename);
        }
    }
    Ok(set)
}

fn resolve_world_info(filename: &str, path: &Path) -> (Option<String>, Option<String>) {
    if filename.to_lowercase().ends_with(".png") {
        return extract_vrc_metadata_from_png(path);
    }
    (None, None)
}

fn upsert_photo_batch(
    conn: &mut Connection,
    items: &[(
        String,
        PathBuf,
        Option<String>,
        Option<String>,
        String,
        Option<String>,
    )],
) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start insert transaction: {}", e))?;
    {
        let mut stmt = tx
            .prepare(
                "INSERT OR IGNORE INTO photos (photo_filename, photo_path, world_id, world_name, timestamp, phash) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            )
            .map_err(|e| format!("Failed to prepare insert statement: {}", e))?;
        for (filename, path, world_id, world_name, timestamp, phash) in items {
            let path_str = path.to_slash_lossy().to_string();
            stmt.execute(params![
                filename, path_str, world_id, world_name, timestamp, phash
            ])
            .map_err(|e| format!("Failed to insert photo {}: {}", filename, e))?;
        }
    }
    tx.commit()
        .map_err(|e| format!("Failed to commit insert transaction: {}", e))?;
    Ok(())
}

fn backfill_missing_world_info(conn: &Connection) -> Result<usize, String> {
    let mut stmt = conn
        .prepare("SELECT photo_filename, photo_path, timestamp FROM photos WHERE world_id IS NULL")
        .map_err(|e| scan_err("Failed to prepare backfill query", e))?;

    let rows: Vec<(String, String, String)> = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| scan_err("Failed to execute backfill query", e))?
        .filter_map(|row| warn_row_error(row, "backfill row decode failed"))
        .collect();

    if rows.is_empty() {
        return Ok(0);
    }

    let mut updated = 0usize;
    for (filename, path_str, _timestamp) in &rows {
        let path = Path::new(path_str);
        let (world_name, world_id) = resolve_world_info(filename, path);
        if world_name.is_some() || world_id.is_some() {
            conn.execute(
                "UPDATE photos SET world_id = ?1, world_name = ?2 WHERE photo_filename = ?3",
                params![world_id, world_name, filename],
            )
            .map_err(|e| scan_err("Failed to apply backfill update", e))?;
            updated += 1;
        }
    }
    Ok(updated)
}

fn extract_vrc_metadata_from_png(path: &Path) -> (Option<String>, Option<String>) {
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(err) => {
            crate::utils::log_err(&format!("[PNG parse] Failed to open {:?}: {}", path, err));
            return (None, None);
        }
    };

    let mut reader = BufReader::new(file);
    let mut sig = [0u8; 8];
    if reader.read_exact(&mut sig).is_err() || sig != *b"\x89PNG\r\n\x1a\n" {
        crate::utils::log_warn(&format!("[PNG parse] Invalid PNG signature for {:?}", path));
        return (None, None);
    }

    let mut chunk_data = Vec::new();
    loop {
        let mut header = [0u8; 8];
        if reader.read_exact(&mut header).is_err() {
            break;
        }

        let chunk_len = u32::from_be_bytes([header[0], header[1], header[2], header[3]]) as usize;
        let chunk_type = [header[4], header[5], header[6], header[7]];

        if &chunk_type == b"iTXt" {
            if chunk_len > MAX_ITXT_SIZE {
                if let Err(err) = reader.seek(SeekFrom::Current(chunk_len as i64 + 4)) {
                    crate::utils::log_warn(&format!(
                        "[PNG parse] Failed to seek after iTXt skip: {}",
                        err
                    ));
                    break;
                }
                continue;
            }
            chunk_data.clear();
            chunk_data.resize(chunk_len, 0u8);
            if reader.read_exact(&mut chunk_data).is_err() {
                crate::utils::log_err("[PNG parse] Failed to read iTXt chunk data");
                break;
            }
            if let Some(null_pos) = chunk_data.iter().position(|&b| b == 0) {
                let keyword = String::from_utf8_lossy(&chunk_data[..null_pos]);
                if keyword == "XML:com.adobe.xmp" {
                    let mut pos = null_pos + 1;
                    if pos + 2 <= chunk_data.len() {
                        pos += 2;
                        if let Some(lang_null) = chunk_data[pos..].iter().position(|&b| b == 0) {
                            pos += lang_null + 1;
                            if let Some(tk_null) = chunk_data[pos..].iter().position(|&b| b == 0) {
                                pos += tk_null + 1;
                                let xmp_text = String::from_utf8_lossy(&chunk_data[pos..]);
                                return parse_vrc_from_xmp(&xmp_text);
                            }
                        }
                    }
                }
            }
            if let Err(err) = reader.seek(SeekFrom::Current(4)) {
                crate::utils::log_warn(&format!(
                    "[PNG parse] Failed to seek after iTXt CRC: {}",
                    err
                ));
                break;
            }
        } else if &chunk_type == b"IDAT" || &chunk_type == b"IEND" {
            break;
        } else {
            if let Err(err) = reader.seek(SeekFrom::Current(chunk_len as i64 + 4)) {
                crate::utils::log_warn(&format!(
                    "[PNG parse] Failed to seek after chunk skip: {}",
                    err
                ));
                break;
            }
        }
    }

    (None, None)
}

fn parse_vrc_from_xmp(xmp: &str) -> (Option<String>, Option<String>) {
    let world_id = RE_ID
        .captures(xmp)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string());
    let world_name = RE_NAME
        .captures(xmp)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string());
    (world_name, world_id)
}

fn collect_photos_recursive(
    dir: &Path,
    files: &mut Vec<(String, PathBuf)>,
    re: &Regex,
    cancel_status: &ScanCancelStatus,
) {
    if cancel_status.0.load(Ordering::SeqCst) {
        return;
    }

    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(err) => {
            crate::utils::log_warn(&format!(
                "Failed to read directory {}: {}",
                dir.display(),
                err
            ));
            return;
        }
    };

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(err) => {
                crate::utils::log_warn(&format!(
                    "Failed to read entry in {}: {}",
                    dir.display(),
                    err
                ));
                continue;
            }
        };

        let path = entry.path();
        if let Ok(meta) = fs::symlink_metadata(&path) {
            if meta.file_type().is_symlink() {
                continue;
            }
        }

        if path.is_dir() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                let n_low = name.to_lowercase();
                if name.starts_with('.') || SKIP_DIRS.contains(&n_low.as_str()) {
                    continue;
                }
            }
            collect_photos_recursive(&path, files, re, cancel_status);
            if cancel_status.0.load(Ordering::SeqCst) {
                return;
            }
        } else if path.is_file() {
            if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
                if filename.to_lowercase().starts_with("vrchat_")
                    && re.is_match(filename)
                    && is_supported_image_extension(filename)
                {
                    files.push((filename.to_string(), path.to_path_buf()));
                }
            }
        }
    }
}

fn is_supported_image_extension(filename: &str) -> bool {
    let ext = Path::new(filename)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    match ext {
        Some(ext) => SUPPORTED_EXTENSIONS.contains(&ext.as_str()),
        None => false,
    }
}

fn apply_phash_updates(conn: &mut Connection, updates: &[(String, String)]) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to start pHash transaction: {}", e))?;
    {
        let mut stmt = tx
            .prepare("UPDATE photos SET phash = ?1 WHERE photo_filename = ?2")
            .map_err(|e| format!("Failed to prepare pHash update statement: {}", e))?;
        for (phash, filename) in updates {
            stmt.execute(params![phash, filename])
                .map_err(|e| format!("Failed to update pHash for {}: {}", filename, e))?;
        }
    }
    tx.commit()
        .map_err(|e| format!("Failed to commit pHash transaction: {}", e))?;
    Ok(())
}
```

---

## FILE: src\utils.rs

`$ext
use chrono::Local;
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

const REGISTRY_BASE_KEY: &str = "Software\\CosmoArtsStore\\STELLAProject";

fn get_install_dir_by_component(component: &str) -> Option<PathBuf> {
    let key_path = format!("{}\\{}", REGISTRY_BASE_KEY, component);
    let key = match RegKey::predef(HKEY_CURRENT_USER).open_subkey(&key_path) {
        Ok(key) => key,
        Err(err) => {
            eprintln!(
                "[Alpheratz][WARN] registry open failed [{}]: {}",
                key_path, err
            );
            return None;
        }
    };
    let path: String = match key.get_value("InstallLocation") {
        Ok(path) => path,
        Err(err) => {
            eprintln!(
                "[Alpheratz][WARN] registry value read failed [{}\\InstallLocation]: {}",
                key_path, err
            );
            return None;
        }
    };
    Some(PathBuf::from(path))
}

pub fn get_alpheratz_install_dir() -> Option<PathBuf> {
    get_install_dir_by_component("Alpheratz")
}

pub fn log_msg(level: &str, msg: &str) {
    if let Some(path) = get_alpheratz_install_dir().map(|p| p.join("info.log")) {
        match OpenOptions::new().create(true).append(true).open(&path) {
            Ok(mut f) => {
                let now = Local::now().format("%Y-%m-%d %H:%M:%S");
                if let Err(err) = writeln!(f, "[{}] [{}] {}", now, level, msg) {
                    // Intentional: fallback to stderr to avoid recursive log errors.
                    eprintln!(
                        "[Alpheratz][WARN] log write failed [{}]: {}",
                        path.display(),
                        err
                    );
                }
            }
            Err(err) => {
                // Intentional: fallback to stderr to avoid recursive log errors.
                eprintln!(
                    "[Alpheratz][WARN] log open failed [{}]: {}",
                    path.display(),
                    err
                );
            }
        }
    }
}

pub fn log_warn(msg: &str) {
    log_msg("WARN", msg);
}
pub fn log_err(msg: &str) {
    log_msg("ERROR", msg);
}

pub fn get_thumbnail_cache_dir() -> Result<PathBuf, String> {
    let install_dir =
        get_alpheratz_install_dir().ok_or_else(|| "Failed to get install dir".to_string())?;
    let cache_dir = install_dir.join("cache");
    fs::create_dir_all(&cache_dir).map_err(|e| {
        format!(
            "Failed to create cache directory ({}): {}",
            cache_dir.display(),
            e
        )
    })?;
    Ok(cache_dir)
}

pub fn create_thumbnail_file(path: &str) -> Result<String, String> {
    let cache_dir = get_thumbnail_cache_dir()?;
    let path_p = Path::new(path);
    let filename = path_p
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| "Failed to resolve file name".to_string())?;
    let cache_path = cache_dir.join(format!("{}.thumb.jpg", filename));

    if cache_path.exists() {
        return Ok(cache_path.to_string_lossy().to_string());
    }

    let img = image::open(path)
        .map_err(|e| format!("Failed to open image for thumbnail ({}): {}", path, e))?;
    let thumb = img.thumbnail(360, 360);
    thumb.save(&cache_path).map_err(|e| {
        format!(
            "Failed to save thumbnail ({}): {}",
            cache_path.display(),
            e
        )
    })?;

    Ok(cache_path.to_string_lossy().to_string())
}
```

---

## FILE: tauri.conf.json

`$ext
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Alpheratz",
  "version": "0.1.0",
  "identifier": "com.cosmoartsstore.alpheratz",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Alpheratz",
        "width": 1280,
        "height": 800,
        "maximized": true
      }
    ],
    "security": {
      "csp": null,
      "assetProtocol": {
        "enable": true,
        "scope": [
          "**/*.png",
          "**/*.jpg",
          "**/*.jpeg",
          "**/*.webp",
          "**/*.psd",
          "**/*.tiff",
          "**/*.tif",
          "**/*.bmp",
          "**/*.gif"
        ]
      }
    }
  },
  "bundle": {
    "active": true,
    "resources": [
      "../public/Alpheratz-logo.png"
    ],
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "windows": {
      "nsis": {
        "template": "windows/installer.nsi",
        "installerHooks": "windows/hooks.nsi",
        "installerIcon": "icons/icon.ico",
        "headerImage": "icons/headerUI.bmp",
        "sidebarImage": "icons/wizardUI.bmp",
        "languages": [
          "Japanese"
        ]
      }
    }
  }
}
```

---

## FILE: windows\hooks.nsi

`$ext
!macro NSIS_HOOK_PREINSTALL
    nsExec::Exec 'taskkill /F /IM Alpheratz.exe 2>nul'
!macroend

!macro NSIS_HOOK_POSTINSTALL
    ; AlpheratzはUIアプリのため、スタートアップ自動登録なし
!macroend

!macro NSIS_HOOK_PREUNINSTALL
    nsExec::Exec 'taskkill /F /IM Alpheratz.exe 2>nul'
!macroend
```

---

## FILE: windows\installer.nsi

`$ext
Unicode true
ManifestDPIAware true
; Add in `dpiAwareness` `PerMonitorV2` to manifest for Windows 10 1607+ (note this should not affect lower versions since they should be able to ignore this and pick up `dpiAware` `true` set by `ManifestDPIAware true`)
; Currently undocumented on NSIS's website but is in the Docs folder of source tree, see
; https://github.com/kichik/nsis/blob/5fc0b87b819a9eec006df4967d08e522ddd651c9/Docs/src/attributes.but#L286-L300
; https://github.com/tauri-apps/tauri/pull/10106
ManifestDPIAwareness PerMonitorV2

!if "{{compression}}" == "none"
  SetCompress off
!else
  ; Set the compression algorithm. We default to LZMA.
  SetCompressor /SOLID "{{compression}}"
!endif

!include MUI2.nsh
!include FileFunc.nsh
!include x64.nsh
!include WordFunc.nsh
!include "utils.nsh"
!include "FileAssociation.nsh"
!include "Win\COM.nsh"
!include "Win\Propkey.nsh"
!include "StrFunc.nsh"
${StrCase}
${StrLoc}

{{#if installer_hooks}}
!include "{{installer_hooks}}"
{{/if}}

!define WEBVIEW2APPGUID "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"

!define MANUFACTURER "{{manufacturer}}"
!define PRODUCTNAME "{{product_name}}"
!define VERSION "{{version}}"
!define VERSIONWITHBUILD "{{version_with_build}}"
!define HOMEPAGE "{{homepage}}"
!define INSTALLMODE "{{install_mode}}"
!define LICENSE "{{license}}"
!define INSTALLERICON "{{installer_icon}}"
!define SIDEBARIMAGE "{{sidebar_image}}"
!define HEADERIMAGE "{{header_image}}"
!define MAINBINARYNAME "{{main_binary_name}}"
!define MAINBINARYSRCPATH "{{main_binary_path}}"
!define BUNDLEID "{{bundle_id}}"
!define COPYRIGHT "{{copyright}}"
!define OUTFILE "{{out_file}}"
!define ARCH "{{arch}}"
!define ADDITIONALPLUGINSPATH "{{additional_plugins_path}}"
!define ALLOWDOWNGRADES "{{allow_downgrades}}"
!define DISPLAYLANGUAGESELECTOR "{{display_language_selector}}"
!define INSTALLWEBVIEW2MODE "{{install_webview2_mode}}"
!define WEBVIEW2INSTALLERARGS "{{webview2_installer_args}}"
!define WEBVIEW2BOOTSTRAPPERPATH "{{webview2_bootstrapper_path}}"
!define WEBVIEW2INSTALLERPATH "{{webview2_installer_path}}"
!define MINIMUMWEBVIEW2VERSION "{{minimum_webview2_version}}"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}"
!define MANUKEY "Software\${MANUFACTURER}"
!define MANUPRODUCTKEY "${MANUKEY}\${PRODUCTNAME}"
!define UNINSTALLERSIGNCOMMAND "{{uninstaller_sign_cmd}}"
!define ESTIMATEDSIZE "{{estimated_size}}"
!define STARTMENUFOLDER "{{start_menu_folder}}"

Var PassiveMode
Var UpdateMode
Var NoShortcutMode
Var WixMode
Var OldMainBinaryName

Name "${PRODUCTNAME}"
BrandingText "${COPYRIGHT}"
OutFile "${OUTFILE}"

; We don't actually use this value as default install path,
; it's just for nsis to append the product name folder in the directory selector
; https://nsis.sourceforge.io/Reference/InstallDir
!define PLACEHOLDER_INSTALL_DIR "placeholder\${PRODUCTNAME}"
InstallDir "${PLACEHOLDER_INSTALL_DIR}"

VIProductVersion "${VERSIONWITHBUILD}"
VIAddVersionKey "ProductName" "${PRODUCTNAME}"
VIAddVersionKey "FileDescription" "${PRODUCTNAME}"
VIAddVersionKey "LegalCopyright" "${COPYRIGHT}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"

# additional plugins
!addplugindir "${ADDITIONALPLUGINSPATH}"

; Uninstaller signing command
!if "${UNINSTALLERSIGNCOMMAND}" != ""
  !uninstfinalize '${UNINSTALLERSIGNCOMMAND}'
!endif

; Handle install mode, `perUser`, `perMachine` or `both`
!if "${INSTALLMODE}" == "perMachine"
  RequestExecutionLevel admin
!endif

!if "${INSTALLMODE}" == "currentUser"
  RequestExecutionLevel user
!endif

!if "${INSTALLMODE}" == "both"
  !define MULTIUSER_MUI
  !define MULTIUSER_INSTALLMODE_INSTDIR "${PRODUCTNAME}"
  !define MULTIUSER_INSTALLMODE_COMMANDLINE
  !if "${ARCH}" == "x64"
    !define MULTIUSER_USE_PROGRAMFILES64
  !else if "${ARCH}" == "arm64"
    !define MULTIUSER_USE_PROGRAMFILES64
  !endif
  !define MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_KEY "${UNINSTKEY}"
  !define MULTIUSER_INSTALLMODE_DEFAULT_REGISTRY_VALUENAME "CurrentUser"
  !define MULTIUSER_INSTALLMODEPAGE_SHOWUSERNAME
  !define MULTIUSER_INSTALLMODE_FUNCTION RestorePreviousInstallLocation
  !define MULTIUSER_EXECUTIONLEVEL Highest
  !include MultiUser.nsh
!endif

; Installer icon
!if "${INSTALLERICON}" != ""
  !define MUI_ICON "${INSTALLERICON}"
!endif

; Installer sidebar image
!if "${SIDEBARIMAGE}" != ""
  !define MUI_WELCOMEFINISHPAGE_BITMAP "${SIDEBARIMAGE}"
!endif

; Installer header image
!if "${HEADERIMAGE}" != ""
  !define MUI_HEADERIMAGE
  !define MUI_HEADERIMAGE_BITMAP  "${HEADERIMAGE}"
!endif

; Define registry key to store installer language
!define MUI_LANGDLL_REGISTRY_ROOT "HKCU"
!define MUI_LANGDLL_REGISTRY_KEY "${MANUPRODUCTKEY}"
!define MUI_LANGDLL_REGISTRY_VALUENAME "Installer Language"

; Installer pages, must be ordered as they appear
; 1. Welcome Page
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!insertmacro MUI_PAGE_WELCOME

; 2. License Page (if defined)
!if "${LICENSE}" != ""
  !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
  !insertmacro MUI_PAGE_LICENSE "${LICENSE}"
!endif

; 3. Install mode (if it is set to `both`)
!if "${INSTALLMODE}" == "both"
  !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
  !insertmacro MULTIUSER_PAGE_INSTALLMODE
!endif

; 4. Custom page to ask user if he wants to reinstall/uninstall
;    only if a previous installation was detected
Var ReinstallPageCheck
Page custom PageReinstall PageLeaveReinstall
Function PageReinstall
  ; Uninstall previous WiX installation if exists.
  ;
  ; A WiX installer stores the installation info in registry
  ; using a UUID and so we have to loop through all keys under
  ; `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`
  ; and check if `DisplayName` and `Publisher` keys match ${PRODUCTNAME} and ${MANUFACTURER}
  ;
  ; This has a potential issue that there maybe another installation that matches
  ; our ${PRODUCTNAME} and ${MANUFACTURER} but wasn't installed by our WiX installer,
  ; however, this should be fine since the user will have to confirm the uninstallation
  ; and they can chose to abort it if doesn't make sense.
  StrCpy $0 0
  wix_loop:
    EnumRegKey $1 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall" $0
    StrCmp $1 "" wix_loop_done ; Exit loop if there is no more keys to loop on
    IntOp $0 $0 + 1
    ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "DisplayName"
    ReadRegStr $R1 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "Publisher"
    StrCmp "$R0$R1" "${PRODUCTNAME}${MANUFACTURER}" 0 wix_loop
    ReadRegStr $R0 HKLM "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1" "UninstallString"
    ${StrCase} $R1 $R0 "L"
    ${StrLoc} $R0 $R1 "msiexec" ">"
    StrCmp $R0 0 0 wix_loop_done
    StrCpy $WixMode 1
    StrCpy $R6 "SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$1"
    Goto compare_version
  wix_loop_done:

  ; Check if there is an existing installation, if not, abort the reinstall page
  ReadRegStr $R0 SHCTX "${UNINSTKEY}" ""
  ReadRegStr $R1 SHCTX "${UNINSTKEY}" "UninstallString"
  ${IfThen} "$R0$R1" == "" ${|} Abort ${|}

  ; Compare this installar version with the existing installation
  ; and modify the messages presented to the user accordingly
  compare_version:
  StrCpy $R4 "$(older)"
  ${If} $WixMode = 1
    ReadRegStr $R0 HKLM "$R6" "DisplayVersion"
  ${Else}
    ReadRegStr $R0 SHCTX "${UNINSTKEY}" "DisplayVersion"
  ${EndIf}
  ${IfThen} $R0 == "" ${|} StrCpy $R4 "$(unknown)" ${|}

  nsis_tauri_utils::SemverCompare "${VERSION}" $R0
  Pop $R0
  ; Reinstalling the same version
  ${If} $R0 = 0
    StrCpy $R1 "$(alreadyInstalledLong)"
    StrCpy $R2 "$(addOrReinstall)"
    StrCpy $R3 "$(uninstallApp)"
    !insertmacro MUI_HEADER_TEXT "$(alreadyInstalled)" "$(chooseMaintenanceOption)"
  ; Upgrading
  ${ElseIf} $R0 = 1
    StrCpy $R1 "$(olderOrUnknownVersionInstalled)"
    StrCpy $R2 "$(uninstallBeforeInstalling)"
    StrCpy $R3 "$(dontUninstall)"
    !insertmacro MUI_HEADER_TEXT "$(alreadyInstalled)" "$(choowHowToInstall)"
  ; Downgrading
  ${ElseIf} $R0 = -1
    StrCpy $R1 "$(newerVersionInstalled)"
    StrCpy $R2 "$(uninstallBeforeInstalling)"
    !if "${ALLOWDOWNGRADES}" == "true"
      StrCpy $R3 "$(dontUninstall)"
    !else
      StrCpy $R3 "$(dontUninstallDowngrade)"
    !endif
    !insertmacro MUI_HEADER_TEXT "$(alreadyInstalled)" "$(choowHowToInstall)"
  ${Else}
    Abort
  ${EndIf}

  ; Skip showing the page if passive
  ;
  ; Note that we don't call this earlier at the begining
  ; of this function because we need to populate some variables
  ; related to current installed version if detected and whether
  ; we are downgrading or not.
  ${If} $PassiveMode = 1
    Call PageLeaveReinstall
  ${Else}
    nsDialogs::Create 1018
    Pop $R4
    ${IfThen} $(^RTL) = 1 ${|} nsDialogs::SetRTL $(^RTL) ${|}

    ${NSD_CreateLabel} 0 0 100% 24u $R1
    Pop $R1

    ${NSD_CreateRadioButton} 30u 50u -30u 8u $R2
    Pop $R2
    ${NSD_OnClick} $R2 PageReinstallUpdateSelection

    ${NSD_CreateRadioButton} 30u 70u -30u 8u $R3
    Pop $R3
    ; Disable this radio button if downgrading and downgrades are disabled
    !if "${ALLOWDOWNGRADES}" == "false"
      ${IfThen} $R0 = -1 ${|} EnableWindow $R3 0 ${|}
    !endif
    ${NSD_OnClick} $R3 PageReinstallUpdateSelection

    ; Check the first radio button if this the first time
    ; we enter this page or if the second button wasn't
    ; selected the last time we were on this page
    ${If} $ReinstallPageCheck <> 2
      SendMessage $R2 ${BM_SETCHECK} ${BST_CHECKED} 0
    ${Else}
      SendMessage $R3 ${BM_SETCHECK} ${BST_CHECKED} 0
    ${EndIf}

    ${NSD_SetFocus} $R2
    nsDialogs::Show
  ${EndIf}
FunctionEnd
Function PageReinstallUpdateSelection
  ${NSD_GetState} $R2 $R1
  ${If} $R1 == ${BST_CHECKED}
    StrCpy $ReinstallPageCheck 1
  ${Else}
    StrCpy $ReinstallPageCheck 2
  ${EndIf}
FunctionEnd
Function PageLeaveReinstall
  ${NSD_GetState} $R2 $R1

  ; If migrating from Wix, always uninstall
  ${If} $WixMode = 1
    Goto reinst_uninstall
  ${EndIf}

  ; In update mode, always proceeds without uninstalling
  ${If} $UpdateMode = 1
    Goto reinst_done
  ${EndIf}

  ; $R0 holds whether same(0)/upgrading(1)/downgrading(-1) version
  ; $R1 holds the radio buttons state:
  ;   1 => first choice was selected
  ;   0 => second choice was selected
  ${If} $R0 = 0 ; Same version, proceed
    ${If} $R1 = 1              ; User chose to add/reinstall
      Goto reinst_done
    ${Else}                    ; User chose to uninstall
      Goto reinst_uninstall
    ${EndIf}
  ${ElseIf} $R0 = 1 ; Upgrading
    ${If} $R1 = 1              ; User chose to uninstall
      Goto reinst_uninstall
    ${Else}
      Goto reinst_done         ; User chose NOT to uninstall
    ${EndIf}
  ${ElseIf} $R0 = -1 ; Downgrading
    ${If} $R1 = 1              ; User chose to uninstall
      Goto reinst_uninstall
    ${Else}
      Goto reinst_done         ; User chose NOT to uninstall
    ${EndIf}
  ${EndIf}

  reinst_uninstall:
    HideWindow
    ClearErrors

    ${If} $WixMode = 1
      ReadRegStr $R1 HKLM "$R6" "UninstallString"
      ExecWait '$R1' $0
    ${Else}
      ReadRegStr $4 SHCTX "${MANUPRODUCTKEY}" ""
      ReadRegStr $R1 SHCTX "${UNINSTKEY}" "UninstallString"
      ${IfThen} $UpdateMode = 1 ${|} StrCpy $R1 "$R1 /UPDATE" ${|} ; append /UPDATE
      ${IfThen} $PassiveMode = 1 ${|} StrCpy $R1 "$R1 /P" ${|} ; append /P
      StrCpy $R1 "$R1 _?=$4" ; append uninstall directory
      ExecWait '$R1' $0
    ${EndIf}

    BringToFront

    ${IfThen} ${Errors} ${|} StrCpy $0 2 ${|} ; ExecWait failed, set fake exit code

    ${If} $0 <> 0
    ${OrIf} ${FileExists} "$INSTDIR\${MAINBINARYNAME}.exe"
      ; User cancelled wix uninstaller? return to select un/reinstall page
      ${If} $WixMode = 1
      ${AndIf} $0 = 1602
        Abort
      ${EndIf}

      ; User cancelled NSIS uninstaller? return to select un/reinstall page
      ${If} $0 = 1
        Abort
      ${EndIf}

      ; Other erros? show generic error message and return to select un/reinstall page
      MessageBox MB_ICONEXCLAMATION "$(unableToUninstall)"
      Abort
    ${EndIf}
  reinst_done:
FunctionEnd

; 5. Choose install directory page
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!insertmacro MUI_PAGE_DIRECTORY

; 6. Start menu shortcut page
Var AppStartMenuFolder
!if "${STARTMENUFOLDER}" != ""
  !define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
  !define MUI_STARTMENUPAGE_DEFAULTFOLDER "${STARTMENUFOLDER}"
!else
  !define MUI_PAGE_CUSTOMFUNCTION_PRE Skip
!endif
!insertmacro MUI_PAGE_STARTMENU Application $AppStartMenuFolder

; 7. Installation page
!insertmacro MUI_PAGE_INSTFILES

; 8. Finish page
;
; Don't auto jump to finish page after installation page,
; because the installation page has useful info that can be used debug any issues with the installer.
!define MUI_FINISHPAGE_NOAUTOCLOSE
; Use show readme button in the finish page as a button create a desktop shortcut
!define MUI_FINISHPAGE_SHOWREADME
!define MUI_FINISHPAGE_SHOWREADME_TEXT "$(createDesktop)"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION CreateOrUpdateDesktopShortcut
; Show run app after installation.
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_FUNCTION RunMainBinary
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipIfPassive
!insertmacro MUI_PAGE_FINISH

Function RunMainBinary
  nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
FunctionEnd

; Uninstaller Pages
; 1. Confirm uninstall page
Var DeleteAppDataCheckbox
Var DeleteAppDataCheckboxState
!define /ifndef WS_EX_LAYOUTRTL         0x00400000
!define MUI_PAGE_CUSTOMFUNCTION_SHOW un.ConfirmShow
Function un.ConfirmShow ; Add add a `Delete app data` check box
  ; $1 inner dialog HWND
  ; $2 window DPI
  ; $3 style
  ; $4 x
  ; $5 y
  ; $6 width
  ; $7 height
  FindWindow $1 "#32770" "" $HWNDPARENT ; Find inner dialog
  System::Call "user32::GetDpiForWindow(p r1) i .r2"
  ${If} $(^RTL) = 1
    StrCpy $3 "${__NSD_CheckBox_EXSTYLE} | ${WS_EX_LAYOUTRTL}"
    IntOp $4 50 * $2
  ${Else}
    StrCpy $3 "${__NSD_CheckBox_EXSTYLE}"
    IntOp $4 0 * $2
  ${EndIf}
  IntOp $5 100 * $2
  IntOp $6 400 * $2
  IntOp $7 25 * $2
  IntOp $4 $4 / 96
  IntOp $5 $5 / 96
  IntOp $6 $6 / 96
  IntOp $7 $7 / 96
  System::Call 'user32::CreateWindowEx(i r3, w "${__NSD_CheckBox_CLASS}", w "$(deleteAppData)", i ${__NSD_CheckBox_STYLE}, i r4, i r5, i r6, i r7, p r1, i0, i0, i0) i .s'
  Pop $DeleteAppDataCheckbox
  SendMessage $HWNDPARENT ${WM_GETFONT} 0 0 $1
  SendMessage $DeleteAppDataCheckbox ${WM_SETFONT} $1 1
FunctionEnd
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE un.ConfirmLeave
Function un.ConfirmLeave
  SendMessage $DeleteAppDataCheckbox ${BM_GETCHECK} 0 0 $DeleteAppDataCheckboxState
FunctionEnd
!define MUI_PAGE_CUSTOMFUNCTION_PRE un.SkipIfPassive
!insertmacro MUI_UNPAGE_CONFIRM

; 2. Uninstalling Page
!insertmacro MUI_UNPAGE_INSTFILES

;Languages
{{#each languages}}
!insertmacro MUI_LANGUAGE "{{this}}"
{{/each}}
!insertmacro MUI_RESERVEFILE_LANGDLL
{{#each language_files}}
  !include "{{this}}"
{{/each}}

Function .onInit
  ${GetOptions} $CMDLINE "/P" $PassiveMode
  ${IfNot} ${Errors}
    StrCpy $PassiveMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/NS" $NoShortcutMode
  ${IfNot} ${Errors}
    StrCpy $NoShortcutMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/UPDATE" $UpdateMode
  ${IfNot} ${Errors}
    StrCpy $UpdateMode 1
  ${EndIf}

  !if "${DISPLAYLANGUAGESELECTOR}" == "true"
    !insertmacro MUI_LANGDLL_DISPLAY
  !endif

  !insertmacro SetContext

  ${If} $INSTDIR == "${PLACEHOLDER_INSTALL_DIR}"
    ; Set default install location
    !if "${INSTALLMODE}" == "perMachine"
      ${If} ${RunningX64}
        !if "${ARCH}" == "x64"
          StrCpy $INSTDIR "$PROGRAMFILES64\CosmoArtsStore\STELLAProject\${PRODUCTNAME}"
        !else if "${ARCH}" == "arm64"
          StrCpy $INSTDIR "$PROGRAMFILES64\CosmoArtsStore\STELLAProject\${PRODUCTNAME}"
        !else
          StrCpy $INSTDIR "$PROGRAMFILES\CosmoArtsStore\STELLAProject\${PRODUCTNAME}"
        !endif
      ${Else}
        StrCpy $INSTDIR "$PROGRAMFILES\CosmoArtsStore\STELLAProject\${PRODUCTNAME}"
      ${EndIf}
    !else if "${INSTALLMODE}" == "currentUser"
      StrCpy $INSTDIR "$LOCALAPPDATA\CosmoArtsStore\STELLAProject\Alpheratz"
    !endif

    Call RestorePreviousInstallLocation
  ${EndIf}


  !if "${INSTALLMODE}" == "both"
    !insertmacro MULTIUSER_INIT
  !endif
FunctionEnd


Section EarlyChecks
  ; Abort silent installer if downgrades is disabled
  !if "${ALLOWDOWNGRADES}" == "false"
  ${If} ${Silent}
    ; If downgrading
    ${If} $R0 = -1
      System::Call 'kernel32::AttachConsole(i -1)i.r0'
      ${If} $0 <> 0
        System::Call 'kernel32::GetStdHandle(i -11)i.r0'
        System::call 'kernel32::SetConsoleTextAttribute(i r0, i 0x0004)' ; set red color
        FileWrite $0 "$(silentDowngrades)"
      ${EndIf}
      Abort
    ${EndIf}
  ${EndIf}
  !endif

SectionEnd

Section WebView2
  ; Check if Webview2 is already installed and skip this section
  ${If} ${RunningX64}
    ReadRegStr $4 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${Else}
    ReadRegStr $4 HKLM "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${EndIf}
  ${If} $4 == ""
    ReadRegStr $4 HKCU "SOFTWARE\Microsoft\EdgeUpdate\Clients\${WEBVIEW2APPGUID}" "pv"
  ${EndIf}

  ${If} $4 == ""
    ; Webview2 installation
    ;
    ; Skip if updating
    ${If} $UpdateMode <> 1
      !if "${INSTALLWEBVIEW2MODE}" == "downloadBootstrapper"
        Delete "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        DetailPrint "$(webview2Downloading)"
        NSISdl::download "https://go.microsoft.com/fwlink/p/?LinkId=2124703" "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        Pop $0
        ${If} $0 == "success"
          DetailPrint "$(webview2DownloadSuccess)"
        ${Else}
          DetailPrint "$(webview2DownloadError)"
          Abort "$(webview2AbortError)"
        ${EndIf}
        StrCpy $6 "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        Goto install_webview2
      !endif

      !if "${INSTALLWEBVIEW2MODE}" == "embedBootstrapper"
        Delete "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        File "/oname=$TEMP\MicrosoftEdgeWebview2Setup.exe" "${WEBVIEW2BOOTSTRAPPERPATH}"
        DetailPrint "$(installingWebview2)"
        StrCpy $6 "$TEMP\MicrosoftEdgeWebview2Setup.exe"
        Goto install_webview2
      !endif

      !if "${INSTALLWEBVIEW2MODE}" == "offlineInstaller"
        Delete "$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe"
        File "/oname=$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe" "${WEBVIEW2INSTALLERPATH}"
        DetailPrint "$(installingWebview2)"
        StrCpy $6 "$TEMP\MicrosoftEdgeWebView2RuntimeInstaller.exe"
        Goto install_webview2
      !endif

      Goto webview2_done

      install_webview2:
        DetailPrint "$(installingWebview2)"
        ; $6 holds the path to the webview2 installer
        ExecWait "$6 ${WEBVIEW2INSTALLERARGS} /install" $1
        ${If} $1 = 0
          DetailPrint "$(webview2InstallSuccess)"
        ${Else}
          DetailPrint "$(webview2InstallError)"
          Abort "$(webview2AbortError)"
        ${EndIf}
      webview2_done:
    ${EndIf}
  ${Else}
    !if "${MINIMUMWEBVIEW2VERSION}" != ""
      ${VersionCompare} "${MINIMUMWEBVIEW2VERSION}" "$4" $R0
      ${If} $R0 = 1
        update_webview:
          DetailPrint "$(installingWebview2)"
          ${If} ${RunningX64}
            ReadRegStr $R1 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate" "path"
          ${Else}
            ReadRegStr $R1 HKLM "SOFTWARE\Microsoft\EdgeUpdate" "path"
          ${EndIf}
          ${If} $R1 == ""
            ReadRegStr $R1 HKCU "SOFTWARE\Microsoft\EdgeUpdate" "path"
          ${EndIf}
          ${If} $R1 != ""
            ; Chromium updater docs: https://source.chromium.org/chromium/chromium/src/+/main:docs/updater/user_manual.md
            ; Modified from "HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Microsoft EdgeWebView\ModifyPath"
            ExecWait `"$R1" /install appguid=${WEBVIEW2APPGUID}&needsadmin=true` $1
            ${If} $1 = 0
              DetailPrint "$(webview2InstallSuccess)"
            ${Else}
              MessageBox MB_ICONEXCLAMATION|MB_ABORTRETRYIGNORE "$(webview2InstallError)" IDIGNORE ignore IDRETRY update_webview
              Quit
              ignore:
            ${EndIf}
          ${EndIf}
      ${EndIf}
    !endif
  ${EndIf}
SectionEnd

Section Install
  SetOutPath $INSTDIR

  !ifmacrodef NSIS_HOOK_PREINSTALL
    !insertmacro NSIS_HOOK_PREINSTALL
  !endif

  !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"

  ; Copy main executable
  File "${MAINBINARYSRCPATH}"

  ; Copy resources
  {{#each resources_dirs}}
    CreateDirectory "$INSTDIR\\{{this}}"
  {{/each}}
  {{#each resources}}
    File /a "/oname={{this.[1]}}" "{{no-escape @key}}"
  {{/each}}

  ; Copy external binaries
  {{#each binaries}}
    File /a "/oname={{this}}" "{{no-escape @key}}"
  {{/each}}

  ; Create file associations
  {{#each file_associations as |association| ~}}
    {{#each association.ext as |ext| ~}}
       !insertmacro APP_ASSOCIATE "{{ext}}" "{{or association.name ext}}" "{{association-description association.description ext}}" "$INSTDIR\${MAINBINARYNAME}.exe,0" "Open with ${PRODUCTNAME}" "$INSTDIR\${MAINBINARYNAME}.exe $\"%1$\""
    {{/each}}
  {{/each}}

  ; Register deep links
  {{#each deep_link_protocols as |protocol| ~}}
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}" "URL Protocol" ""
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}" "" "URL:${BUNDLEID} protocol"
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}\DefaultIcon" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
    WriteRegStr SHCTX "Software\Classes\\{{protocol}}\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
  {{/each}}

  ; Create uninstaller
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; Save $INSTDIR in registry for future installations
  WriteRegStr SHCTX "${MANUPRODUCTKEY}" "" $INSTDIR

  !if "${INSTALLMODE}" == "both"
    ; Save install mode to be selected by default for the next installation such as updating
    ; or when uninstalling
    WriteRegStr SHCTX "${UNINSTKEY}" $MultiUser.InstallMode 1
  !endif

  ; Remove old main binary if it doesn't match new main binary name
  ReadRegStr $OldMainBinaryName SHCTX "${UNINSTKEY}" "MainBinaryName"
  ${If} $OldMainBinaryName != ""
  ${AndIf} $OldMainBinaryName != "${MAINBINARYNAME}.exe"
    Delete "$INSTDIR\$OldMainBinaryName"
  ${EndIf}

  ; Save current MAINBINARYNAME for future updates
  WriteRegStr SHCTX "${UNINSTKEY}" "MainBinaryName" "${MAINBINARYNAME}.exe"

  ; Registry information for add/remove programs
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayIcon" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\""
  WriteRegStr SHCTX "${UNINSTKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr SHCTX "${UNINSTKEY}" "Publisher" "${MANUFACTURER}"
  WriteRegStr SHCTX "${UNINSTKEY}" "InstallLocation" "$\"$INSTDIR$\""
  WriteRegStr SHCTX "${UNINSTKEY}" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  WriteRegDWORD SHCTX "${UNINSTKEY}" "NoModify" "1"
  WriteRegDWORD SHCTX "${UNINSTKEY}" "NoRepair" "1"

  ${GetSize} "$INSTDIR" "/M=uninstall.exe /S=0K /G=0" $0 $1 $2
  IntOp $0 $0 + ${ESTIMATEDSIZE}
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD SHCTX "${UNINSTKEY}" "EstimatedSize" "$0"

  !if "${HOMEPAGE}" != ""
    WriteRegStr SHCTX "${UNINSTKEY}" "URLInfoAbout" "${HOMEPAGE}"
    WriteRegStr SHCTX "${UNINSTKEY}" "URLUpdateInfo" "${HOMEPAGE}"
    WriteRegStr SHCTX "${UNINSTKEY}" "HelpLink" "${HOMEPAGE}"
  !endif

  ; Create start menu shortcut
  !insertmacro MUI_STARTMENU_WRITE_BEGIN Application
    Call CreateOrUpdateStartMenuShortcut
  !insertmacro MUI_STARTMENU_WRITE_END

  ; Create desktop shortcut for silent and passive installers
  ; because finish page will be skipped
  ${If} $PassiveMode = 1
  ${OrIf} ${Silent}
    Call CreateOrUpdateDesktopShortcut
  ${EndIf}

  !ifmacrodef NSIS_HOOK_POSTINSTALL
    !insertmacro NSIS_HOOK_POSTINSTALL
  !endif

  ; 追加: 共通命名規則に基づくレジストリ位置への書き込み
  WriteRegStr HKCU "Software\CosmoArtsStore\STELLAProject\Alpheratz" "InstallLocation" "$INSTDIR"

  ; Auto close this page for passive mode
  ${If} $PassiveMode = 1
    SetAutoClose true
  ${EndIf}
SectionEnd

Function .onInstSuccess
  ; Check for `/R` flag only in silent and passive installers because
  ; GUI installer has a toggle for the user to (re)start the app
  ${If} $PassiveMode = 1
  ${OrIf} ${Silent}
    ${GetOptions} $CMDLINE "/R" $R0
    ${IfNot} ${Errors}
      ${GetOptions} $CMDLINE "/ARGS" $R0
      nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" "$R0"
    ${EndIf}
  ${EndIf}
FunctionEnd

Function un.onInit
  !insertmacro SetContext

  !if "${INSTALLMODE}" == "both"
    !insertmacro MULTIUSER_UNINIT
  !endif

  !insertmacro MUI_UNGETLANGUAGE

  ${GetOptions} $CMDLINE "/P" $PassiveMode
  ${IfNot} ${Errors}
    StrCpy $PassiveMode 1
  ${EndIf}

  ${GetOptions} $CMDLINE "/UPDATE" $UpdateMode
  ${IfNot} ${Errors}
    StrCpy $UpdateMode 1
  ${EndIf}
FunctionEnd

Section Uninstall

  !ifmacrodef NSIS_HOOK_PREUNINSTALL
    !insertmacro NSIS_HOOK_PREUNINSTALL
  !endif

  !insertmacro CheckIfAppIsRunning "${MAINBINARYNAME}.exe" "${PRODUCTNAME}"

  ; Delete the app directory and its content from disk
  ; Copy main executable
  Delete "$INSTDIR\${MAINBINARYNAME}.exe"

  ; Delete resources
  {{#each resources}}
    Delete "$INSTDIR\\{{this.[1]}}"
  {{/each}}

  ; Delete external binaries
  {{#each binaries}}
    Delete "$INSTDIR\\{{this}}"
  {{/each}}

  ; Delete app associations
  {{#each file_associations as |association| ~}}
    {{#each association.ext as |ext| ~}}
      !insertmacro APP_UNASSOCIATE "{{ext}}" "{{or association.name ext}}"
    {{/each}}
  {{/each}}

  ; Delete deep links
  {{#each deep_link_protocols as |protocol| ~}}
    ReadRegStr $R7 SHCTX "Software\Classes\\{{protocol}}\shell\open\command" ""
    ${If} $R7 == "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
      DeleteRegKey SHCTX "Software\Classes\\{{protocol}}"
    ${EndIf}
  {{/each}}


  ; Delete uninstaller
  Delete "$INSTDIR\uninstall.exe"

  {{#each resources_ancestors}}
  RMDir /REBOOTOK "$INSTDIR\\{{this}}"
  {{/each}}
  RMDir "$INSTDIR"

  ; Remove shortcuts if not updating
  ${If} $UpdateMode <> 1
    !insertmacro DeleteAppUserModelId

    ; Remove start menu shortcut
    !insertmacro MUI_STARTMENU_GETFOLDER Application $AppStartMenuFolder
    !insertmacro IsShortcutTarget "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
      Delete "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
      RMDir "$SMPROGRAMS\$AppStartMenuFolder"
    ${EndIf}
    !insertmacro IsShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk"
      Delete "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    ${EndIf}

    ; Remove desktop shortcuts
    !insertmacro IsShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $0
    ${If} $0 = 1
      !insertmacro UnpinShortcut "$DESKTOP\${PRODUCTNAME}.lnk"
      Delete "$DESKTOP\${PRODUCTNAME}.lnk"
    ${EndIf}
  ${EndIf}

  ; Remove registry information for add/remove programs
  !if "${INSTALLMODE}" == "both"
    DeleteRegKey SHCTX "${UNINSTKEY}"
  !else if "${INSTALLMODE}" == "perMachine"
    DeleteRegKey HKLM "${UNINSTKEY}"
  !else
    DeleteRegKey HKCU "${UNINSTKEY}"
  !endif

  ; Removes the Autostart entry for ${PRODUCTNAME} from the HKCU Run key if it exists.
  ; This ensures the program does not launch automatically after uninstallation if it exists.
  ; If it doesn't exist, it does nothing.
  ; We do this when not updating (to preserve the registry value on updates)
  ${If} $UpdateMode <> 1
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"
  ${EndIf}

  ; Delete app data if the checkbox is selected
  ; and if not updating
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    ; Clear the install location $INSTDIR from registry
    DeleteRegKey SHCTX "${MANUPRODUCTKEY}"
    DeleteRegKey /ifempty SHCTX "${MANUKEY}"

    ; Clear the install language from registry
    DeleteRegValue HKCU "${MANUPRODUCTKEY}" "Installer Language"
    DeleteRegKey /ifempty HKCU "${MANUPRODUCTKEY}"
    DeleteRegKey /ifempty HKCU "${MANUKEY}"

    SetShellVarContext current
    RmDir /r "$APPDATA\${BUNDLEID}"
    RmDir /r "$LOCALAPPDATA\${BUNDLEID}"
  ${EndIf}

  !ifmacrodef NSIS_HOOK_POSTUNINSTALL
    !insertmacro NSIS_HOOK_POSTUNINSTALL
  !endif

  ; 追加: 共通命名規則に基づくレジストリキーの削除
  DeleteRegKey HKCU "Software\CosmoArtsStore\STELLAProject\Alpheratz"

  ; Auto close if passive mode or updating
  ${If} $PassiveMode = 1
  ${OrIf} $UpdateMode = 1
    SetAutoClose true
  ${EndIf}
SectionEnd

Function RestorePreviousInstallLocation
  ReadRegStr $4 SHCTX "${MANUPRODUCTKEY}" ""
  StrCmp $4 "" +2 0
    StrCpy $INSTDIR $4
FunctionEnd

Function Skip
  Abort
FunctionEnd

Function SkipIfPassive
  ${IfThen} $PassiveMode = 1  ${|} Abort ${|}
FunctionEnd
Function un.SkipIfPassive
  ${IfThen} $PassiveMode = 1  ${|} Abort ${|}
FunctionEnd

Function CreateOrUpdateStartMenuShortcut
  ; We used to use product name as MAINBINARYNAME
  ; migrate old shortcuts to target the new MAINBINARYNAME
  StrCpy $R0 0

  !insertmacro IsShortcutTarget "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\$OldMainBinaryName"
  Pop $0
  ${If} $0 = 1
    !insertmacro SetShortcutTarget "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    StrCpy $R0 1
  ${EndIf}

  !insertmacro IsShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\$OldMainBinaryName"
  Pop $0
  ${If} $0 = 1
    !insertmacro SetShortcutTarget "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    StrCpy $R0 1
  ${EndIf}

  ${If} $R0 = 1
    Return
  ${EndIf}

  ; Skip creating shortcut if in update mode or no shortcut mode
  ; but always create if migrating from wix
  ${If} $WixMode = 0
    ${If} $UpdateMode = 1
    ${OrIf} $NoShortcutMode = 1
      Return
    ${EndIf}
  ${EndIf}

  !if "${STARTMENUFOLDER}" != ""
    CreateDirectory "$SMPROGRAMS\$AppStartMenuFolder"
    CreateShortcut "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
  !else
    CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  !endif
FunctionEnd

Function CreateOrUpdateDesktopShortcut
  ; We used to use product name as MAINBINARYNAME
  ; migrate old shortcuts to target the new MAINBINARYNAME
  !insertmacro IsShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\$OldMainBinaryName"
  Pop $0
  ${If} $0 = 1
    !insertmacro SetShortcutTarget "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    Return
  ${EndIf}

  ; Skip creating shortcut if in update mode or no shortcut mode
  ; but always create if migrating from wix
  ${If} $WixMode = 0
    ${If} $UpdateMode = 1
    ${OrIf} $NoShortcutMode = 1
      Return
    ${EndIf}
  ${EndIf}

  CreateShortcut "$DESKTOP\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  !insertmacro SetLnkAppUserModelId "$DESKTOP\${PRODUCTNAME}.lnk"
FunctionEnd
```

