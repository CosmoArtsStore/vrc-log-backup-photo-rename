#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use lbt_core::config::{load_preferences, Preferences};
use lbt_core::logger::{log_info, truncate_log};
use std::fs;
use std::path::Path;
use std::time::Duration;
use sysinfo::{System, ProcessesToUpdate};
use tray_icon::{
    menu::{Menu, MenuItem},
    TrayIconBuilder,
};
use tao::event_loop::{ControlFlow, EventLoopBuilder};
#[cfg(target_os = "windows")]
use winapi::um::winbase::RegisterApplicationRestart;

fn register_restart() {
    #[cfg(target_os = "windows")]
    unsafe {
        use std::os::windows::ffi::OsStrExt;
        let cmd = std::ffi::OsStr::new("").encode_wide().chain(std::iter::once(0)).collect::<Vec<u16>>();
        RegisterApplicationRestart(cmd.as_ptr(), 0);
        log_info("System", "Registered for application restart on crash.");
    }
}

fn do_initial_backup(prefs: &Preferences) {
    log_info("Backup", "Performing initial background backup check...");
    perform_backup(&prefs);
}

fn check_capacity(prefs: &Preferences) {
    if let Ok(backup_dir) = prefs.get_effective_target_dir() {
        if backup_dir.exists() {
            let mut total_size = 0_u64;
            if let Ok(entries) = fs::read_dir(&backup_dir) {
                for entry in entries.flatten() {
                    if let Ok(metadata) = entry.metadata() {
                        total_size += metadata.len();
                    }
                }
            }
            if total_size > prefs.capacityThresholdBytes {
                log_info(
                    "CapacityWarning",
                    &format!(
                        "Capacity exceeded: {} bytes / {} bytes",
                        total_size, prefs.capacityThresholdBytes
                    ),
                );
            } else {
                log_info(
                    "CapacityCheck",
                    &format!(
                        "Current capacity: {} bytes (Threshold: {} bytes)",
                        total_size, prefs.capacityThresholdBytes
                    ),
                );
            }
        }
    }
}

fn perform_backup(prefs: &Preferences) {
    if let Ok(home) = std::env::var("USERPROFILE") {
        let src_dir = Path::new(&home).join("AppData\\LocalLow\\VRChat\\VRChat");
        if let Ok(dest_dir) = prefs.get_effective_target_dir() {
            if !dest_dir.exists() {
                let _ = fs::create_dir_all(&dest_dir);
            }
            if let Ok(entries) = fs::read_dir(&src_dir) {
                let mut count = 0;
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                            if name.starts_with("output_log_") && name.ends_with(".txt") {
                                let dest_path = dest_dir.join(name);
                                if !dest_path.exists() {
                                    if fs::copy(&path, &dest_path).is_ok() {
                                        count += 1;
                                    }
                                } else {
                                    if let (Ok(sm), Ok(dm)) = (fs::metadata(&path), fs::metadata(&dest_path)) {
                                        if let (Ok(st), Ok(dt)) = (sm.modified(), dm.modified()) {
                                            if st > dt {
                                                if fs::copy(&path, &dest_path).is_ok() {
                                                    count += 1;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                log_info("Backup", &format!("Backup completed. Copied/Updated {} log files.", count));
            }
        }
    }
}

fn main() {
    truncate_log();
    log_info("System", "OnsiteLogBackupTool started.");

    register_restart();

    let prefs = load_preferences();
    
    // UI Setup (Tray)
    let event_loop = EventLoopBuilder::new().build();
    let tray_menu = Menu::new();
    
    let quit_i = MenuItem::new("Exit (normal)", true, None);
    let _ = tray_menu.append(&quit_i);

    let _tray_icon = match TrayIconBuilder::new()
        .with_menu(Box::new(tray_menu))
        .with_tooltip("LogBackupTool")
        .with_icon(tray_icon::Icon::from_rgba(vec![255; 4 * 16 * 16], 16, 16).unwrap()) 
        .build() {
            Ok(t) => t,
            Err(e) => {
                log_info("Error", &format!("Failed to build tray icon: {}", e));
                return;
            }
        };

    do_initial_backup(&prefs);
    check_capacity(&prefs);

    std::thread::spawn(move || {
        let mut sys = System::new_all();
        let mut was_vrchat_running = false;
        
        loop {
            std::thread::sleep(Duration::from_secs(5));
            sys.refresh_processes(ProcessesToUpdate::All, true);
            
            let is_vrc_running = sys.processes().values().any(|p| {
                let name = p.name().to_string_lossy().to_lowercase();
                name == "vrchat.exe" || name == "vrchat"
            });

            if is_vrc_running && !was_vrchat_running {
                log_info("Monitor", "VRChat launch detected.");
                was_vrchat_running = true;
            } else if !is_vrc_running && was_vrchat_running {
                log_info("Monitor", "VRChat shutdown detected. Waiting 3s for file locks to clear...");
                std::thread::sleep(Duration::from_secs(3));
                
                let current_prefs = load_preferences();
                perform_backup(&current_prefs);
                check_capacity(&current_prefs);
                
                was_vrchat_running = false;
            }
        }
    });

    let menu_channel = tray_icon::menu::MenuEvent::receiver();
    event_loop.run(move |_event, _, control_flow| {
        *control_flow = ControlFlow::WaitUntil(std::time::Instant::now() + std::time::Duration::from_millis(100));

        if let Ok(event) = menu_channel.try_recv() {
            if event.id == quit_i.id() {
                log_info("System", "Exiting through tray menu. (Normal Exit)");
                *control_flow = ControlFlow::Exit;
            }
        }
    });
}
