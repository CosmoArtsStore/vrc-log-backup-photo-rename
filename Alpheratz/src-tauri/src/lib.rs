use tauri::{generate_handler, Builder, AppHandle, State};
use std::sync::atomic::{AtomicBool, Ordering};

pub struct ScanCancelStatus(pub AtomicBool);
use tauri_plugin_shell::ShellExt;

pub mod config;
pub mod models;
pub mod db;
pub mod scanner;
pub mod stellarecord_ext;
pub mod utils;

use config::{load_setting, save_setting, AlpheratzSetting};
use models::{PhotoRecord};
use db::{init_alpheratz_db};

// --- Commands ---

#[tauri::command]
async fn cancel_scan(cancel_status: State<'_, ScanCancelStatus>) -> Result<(), String> {
    cancel_status.0.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
async fn initialize_scan(app: AppHandle, cancel_status: State<'_, ScanCancelStatus>) -> Result<(), String> {
    cancel_status.0.store(false, Ordering::SeqCst);
    let app_clone = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = scanner::do_scan(app_clone.clone()).await {
            println!("Scanner Error: {}", e);
        }
        
        if let Err(e) = scanner::compute_missing_phashes_bg(app_clone).await {
            println!("Phash BG Error: {}", e);
        }
    });
    Ok(())
}

#[tauri::command]
async fn get_photos(
    start_date: Option<String>,
    end_date: Option<String>,
    world_query: Option<String>,
    world_exact: Option<String>
) -> Result<Vec<PhotoRecord>, String> {
    db::get_photos(start_date, end_date, world_query, world_exact)
}

#[tauri::command]
async fn create_thumbnail(path: String) -> Result<String, String> {
    utils::create_thumbnail_file(&path)
}

#[tauri::command]
async fn save_photo_memo(filename: String, memo: String) -> Result<(), String> {
    db::save_photo_memo(&filename, &memo)
}

#[tauri::command]
async fn open_world_url(app: AppHandle, world_id: String) -> Result<(), String> {
    let url = format!("https://vrchat.com/home/world/{}/info", world_id);
    app.shell().open(url, None).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn show_in_explorer(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Fallback for non-windows
        let path_obj = std::path::Path::new(&path);
        if let Some(parent) = path_obj.parent() {
            std::process::Command::new("explorer")
                .arg(parent)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn get_rotated_phashes(path: String) -> Result<Vec<String>, String> {
    use base64::{Engine as _, engine::general_purpose};
    
    let img = image::open(&path).map_err(|e| e.to_string())?;
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

#[tauri::command]
async fn register_to_stellarecord() -> Result<String, String> {
    stellarecord_ext::register_self(
        "Alpheratz", 
        "VR写真とワールド情報を紐付けるギャラリーツール"
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = init_alpheratz_db();

    Builder::default()
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
            save_photo_memo,
            open_world_url,
            show_in_explorer,
            get_rotated_phashes,
            register_to_stellarecord,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
