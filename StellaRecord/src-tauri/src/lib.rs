pub mod analyze;
pub mod commands;
pub mod config;
pub mod models;
pub mod platform;
pub mod utils;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::list_archive_files,
            commands::compress_logs,
            commands::read_archive_log_viewer,
            commands::launch_enhanced_import,
            commands::launch_analyze,
            commands::launch_startup_archive_import,
            commands::cancel_analyze,
            commands::read_registry_catalog,
            commands::launch_external_app,
            commands::get_polaris_logs,
            commands::start_polaris,
            commands::get_storage_status,
            commands::get_db_tables,
            commands::get_db_table_data,
            commands::delete_today_data,
            commands::wipe_database,
            commands::open_folder,
            commands::get_polaris_status,
            commands::get_management_settings,
            commands::save_management_settings,
            commands::get_pending_archive_log_count,
        ])
        .run(tauri::generate_context!());

    if let Err(err) = app {
        utils::log_err(&format!("error while running tauri application: {}", err));
    }
}
