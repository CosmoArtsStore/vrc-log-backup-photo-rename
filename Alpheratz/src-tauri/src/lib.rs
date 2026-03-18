use regex::Regex;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::LazyLock;
use tauri::{generate_handler, AppHandle, Builder, State};
use tauri_plugin_opener::OpenerExt;

use orientation::{OrientationProgressPayload, OrientationWorkerState};
use phash::{PHashProgressPayload, PHashWorkerState};

pub struct ScanCancelStatus(pub AtomicBool);

pub mod config;
pub mod db;
pub mod models;
pub mod orientation;
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
    orientation: Option<String>,
    favorites_only: Option<bool>,
    tag_filters: Option<Vec<String>>,
) -> Result<Vec<PhotoRecord>, String> {
    db::get_photos(start_date, end_date, world_query, world_exact, orientation, favorites_only, tag_filters)
}

#[tauri::command]
async fn create_thumbnail(path: String, source_slot: Option<i64>) -> Result<String, String> {
    let display_path = path.clone();
    let resolved_slot = source_slot.unwrap_or(1);
    tauri::async_runtime::spawn_blocking(move || utils::create_thumbnail_file(&path, resolved_slot))
        .await
        .map_err(|e| {
            format!(
                "サムネイル生成タスクの待機に失敗しました ({}): {}",
                display_path, e
            )
        })?
}

#[tauri::command]
async fn save_photo_memo_cmd(photo_path: String, memo: String, source_slot: i64) -> Result<(), String> {
    db::save_photo_memo(source_slot, &photo_path, &memo)
}

#[tauri::command]
async fn get_photo_memo_cmd(photo_path: String, source_slot: i64) -> Result<String, String> {
    db::get_photo_memo(source_slot, &photo_path)
}

#[tauri::command]
async fn get_photo_tags_cmd(photo_path: String, source_slot: i64) -> Result<Vec<String>, String> {
    db::get_photo_tags(source_slot, &photo_path)
}

#[tauri::command]
async fn set_photo_favorite_cmd(photo_path: String, is_favorite: bool, source_slot: i64) -> Result<(), String> {
    db::set_photo_favorite(source_slot, &photo_path, is_favorite)
}

#[tauri::command]
async fn add_photo_tag_cmd(photo_path: String, tag: String, source_slot: i64) -> Result<(), String> {
    db::add_photo_tag(source_slot, &photo_path, &tag)
}

#[tauri::command]
async fn remove_photo_tag_cmd(photo_path: String, tag: String, source_slot: i64) -> Result<(), String> {
    db::remove_photo_tag(source_slot, &photo_path, &tag)
}

#[tauri::command]
fn get_all_tags_cmd() -> Result<Vec<String>, String> {
    db::get_all_tags()
}

#[tauri::command]
fn create_tag_master_cmd(tag: String) -> Result<(), String> {
    db::create_tag_master(&tag)
}

#[tauri::command]
fn delete_tag_master_cmd(tag: String) -> Result<(), String> {
    db::delete_tag_master(&tag)
}

#[tauri::command]
async fn reset_photo_cache_cmd() -> Result<(), String> {
    db::reset_photo_cache()
}

#[tauri::command]
fn get_backup_candidate_cmd(photo_folder_path: String) -> Result<Option<db::BackupCandidate>, String> {
    db::get_backup_candidate(&photo_folder_path)
}

#[tauri::command]
fn create_cache_backup_cmd(photo_folder_path: String) -> Result<Option<db::BackupCandidate>, String> {
    db::create_cache_backup(&photo_folder_path)
}

#[tauri::command]
fn restore_cache_backup_cmd(photo_folder_path: String) -> Result<bool, String> {
    db::restore_cache_backup(&photo_folder_path)
}

#[tauri::command]
async fn open_world_url(app: AppHandle, world_id: String) -> Result<(), String> {
    if !WORLD_ID_RE.is_match(&world_id) {
        return Err(format!("VRChat ワールドIDの形式が不正です: {}", world_id));
    }
    let url = format!("https://vrchat.com/home/world/{}/info", world_id);
    app.opener()
        .open_url(&url, None::<&str>)
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

#[tauri::command]
async fn start_orientation_calculation_cmd(app: AppHandle) -> Result<(), String> {
    orientation::start_orientation_worker(app);
    Ok(())
}

#[tauri::command]
fn get_orientation_progress_cmd(app: AppHandle) -> OrientationProgressPayload {
    orientation::get_orientation_progress(&app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(err) = init_alpheratz_db() {
        utils::log_err(&format!("Database initialization failed: {}", err));
    }

    let run_result = Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ScanCancelStatus(AtomicBool::new(false)))
        .manage(PHashWorkerState {
            running: AtomicBool::new(false),
            progress: std::sync::Mutex::new(PHashProgressPayload::default()),
        })
        .manage(OrientationWorkerState {
            running: AtomicBool::new(false),
            progress: std::sync::Mutex::new(OrientationProgressPayload::default()),
        })
        .setup(|app| {
            let has_pending = phash::has_pending_phash().unwrap_or(false);
            if has_pending {
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
            get_photo_memo_cmd,
            get_photo_tags_cmd,
            set_photo_favorite_cmd,
            add_photo_tag_cmd,
            remove_photo_tag_cmd,
            get_all_tags_cmd,
            create_tag_master_cmd,
            delete_tag_master_cmd,
            reset_photo_cache_cmd,
            get_backup_candidate_cmd,
            create_cache_backup_cmd,
            restore_cache_backup_cmd,
            open_world_url,
            show_in_explorer,
            get_startup_preference_cmd,
            save_startup_preference_cmd,
            start_phash_calculation_cmd,
            get_phash_progress_cmd,
            start_orientation_calculation_cmd,
            get_orientation_progress_cmd,
        ])
        .run(tauri::generate_context!());

    if let Err(err) = run_result {
        utils::log_err(&format!("Tauri runtime failed: {}", err));
    }
}
