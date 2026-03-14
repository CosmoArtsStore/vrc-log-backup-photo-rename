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
            commands::decompress_logs,
            commands::launch_enhanced_import,
            commands::launch_analyze,
            commands::cancel_analyze,
            commands::read_launcher_json,
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
            commands::get_startup_preference,
            commands::save_startup_preference,
        ])
        .run(tauri::generate_context!());

    if let Err(err) = app {
        utils::log_err(&format!("error while running tauri application: {}", err));
    }
}
