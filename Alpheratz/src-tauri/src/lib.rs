use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{generate_handler, AppHandle, Builder, State};
use tauri_plugin_shell::ShellExt;

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
async fn set_photo_favorite_cmd(filename: String, is_favorite: bool) -> Result<(), String> {
    db::set_photo_favorite(&filename, is_favorite)
}

#[tauri::command]
async fn add_photo_tag_cmd(filename: String, tag: String) -> Result<(), String> {
    db::add_photo_tag(&filename, &tag)
}

#[tauri::command]
async fn remove_photo_tag_cmd(filename: String, tag: String) -> Result<(), String> {
    db::remove_photo_tag(&filename, &tag)
}

#[tauri::command]
async fn open_world_url(app: AppHandle, world_id: String) -> Result<(), String> {
    let url = format!("https://vrchat.com/home/world/{}/info", world_id);
    app.shell()
        .open(url, None)
        .map_err(|e| format!("Failed to open world URL: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn show_in_explorer(path: String) -> Result<(), String> {
    opener::reveal(path).map_err(|e| format!("Failed to reveal path in explorer: {}", e))
}

#[tauri::command]
async fn get_rotated_phashes(path: String) -> Result<Vec<String>, String> {
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
        .plugin(tauri_plugin_shell::init())
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
            set_photo_favorite_cmd,
            add_photo_tag_cmd,
            remove_photo_tag_cmd,
            open_world_url,
            show_in_explorer,
            get_rotated_phashes,
        ])
        .run(tauri::generate_context!());

    if let Err(err) = run_result {
        utils::log_err(&format!("Tauri runtime failed: {}", err));
    }
}
