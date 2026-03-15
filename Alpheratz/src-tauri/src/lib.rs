use regex::Regex;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::LazyLock;
use tauri::{generate_handler, AppHandle, Builder, State};
use tauri_plugin_shell::ShellExt;

use phash::{PHashProgressPayload, PHashWorkerState};

pub struct ScanCancelStatus(pub AtomicBool);

pub mod config;
pub mod db;
pub mod models;
pub mod phash;
pub mod scanner;
pub mod utils;

use config::{load_setting, save_setting, AlpheratzSetting};
use db::init_alpheratz_db;
use models::PhotoRecord;

static WORLD_ID_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^wrld_[A-Za-z0-9_-]+$").expect("world id regex must be valid"));

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
        } else {
            phash::start_phash_worker(app_clone.clone());
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
    let display_path = path.clone();
    tauri::async_runtime::spawn_blocking(move || utils::create_thumbnail_file(&path))
        .await
        .map_err(|e| {
            format!(
                "サムネイル生成タスクの待機に失敗しました ({}): {}",
                display_path, e
            )
        })?
}

#[tauri::command]
async fn save_photo_memo_cmd(photo_path: String, memo: String) -> Result<(), String> {
    db::save_photo_memo(&photo_path, &memo)
}

#[tauri::command]
async fn set_photo_favorite_cmd(photo_path: String, is_favorite: bool) -> Result<(), String> {
    db::set_photo_favorite(&photo_path, is_favorite)
}

#[tauri::command]
async fn add_photo_tag_cmd(photo_path: String, tag: String) -> Result<(), String> {
    db::add_photo_tag(&photo_path, &tag)
}

#[tauri::command]
async fn remove_photo_tag_cmd(photo_path: String, tag: String) -> Result<(), String> {
    db::remove_photo_tag(&photo_path, &tag)
}

#[tauri::command]
async fn open_world_url(app: AppHandle, world_id: String) -> Result<(), String> {
    if !WORLD_ID_RE.is_match(&world_id) {
        return Err(format!("VRChat ワールドIDの形式が不正です: {}", world_id));
    }
    let url = format!("https://vrchat.com/home/world/{}/info", world_id);
    app.shell()
        .open(&url, None)
        .map_err(|e| format!("ワールドURLを開けません [{}]: {}", url, e))?;
    Ok(())
}

#[tauri::command]
async fn show_in_explorer(path: String) -> Result<(), String> {
    let path_ref = Path::new(&path);
    if !path_ref.exists() {
        return Err(format!("対象ファイルが見つかりません: {}", path));
    }
    opener::reveal(path_ref)
        .map_err(|e| format!("エクスプローラーで表示できません [{}]: {}", path, e))
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
fn get_startup_preference_cmd() -> (bool, bool) {
    let setting = load_setting();
    (setting.enable_startup, setting.startup_preference_set)
}

#[tauri::command]
fn save_startup_preference_cmd(enabled: bool) -> Result<(), String> {
    let mut setting = load_setting();
    setting.enable_startup = enabled;
    setting.startup_preference_set = true;
    save_setting(&setting)?;
    utils::set_startup_enabled("Alpheratz", enabled)?;
    Ok(())
}

#[tauri::command]
async fn start_phash_calculation_cmd(app: AppHandle) -> Result<(), String> {
    phash::start_phash_worker(app);
    Ok(())
}

#[tauri::command]
fn get_phash_progress_cmd(app: AppHandle) -> PHashProgressPayload {
    phash::get_phash_progress(&app)
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
        .manage(PHashWorkerState {
            running: AtomicBool::new(false),
            progress: std::sync::Mutex::new(PHashProgressPayload::default()),
        })
        .setup(|app| {
            let has_pending = phash::has_pending_phash().unwrap_or(false);
            let has_unknown_worlds = phash::has_unknown_worlds().unwrap_or(false);
            if has_pending || has_unknown_worlds {
                phash::start_phash_worker(app.handle().clone());
            }
            Ok(())
        })
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
            get_startup_preference_cmd,
            save_startup_preference_cmd,
            start_phash_calculation_cmd,
            get_phash_progress_cmd,
        ])
        .run(tauri::generate_context!());

    if let Err(err) = run_result {
        utils::log_err(&format!("Tauri runtime failed: {}", err));
    }
}
