use std::process::Command;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use sysinfo::{ProcessesToUpdate, System};

use crate::utils;

pub fn install_panic_hook() {
    std::panic::set_hook(Box::new(|info| {
        let location = match info.location() {
            Some(location) => format!("at {}:{}", location.file(), location.line()),
            None => "unknown location".to_string(),
        };
        let payload = info.payload();
        let message = if let Some(text) = payload.downcast_ref::<&str>() {
            text.to_string()
        } else if let Some(text) = payload.downcast_ref::<String>() {
            text.clone()
        } else {
            "No panic message".to_string()
        };

        utils::log_err(&format!("[PANIC] {} {}", message, location));
    }));
}

pub fn ensure_single_instance() {
    #[cfg(windows)]
    {
        use windows::core::PCWSTR;
        use windows::Win32::Foundation::{GetLastError, ERROR_ALREADY_EXISTS};
        use windows::Win32::System::Threading::CreateMutexW;

        let mutex_name: Vec<u16> = "Global\\StellaRecord_SingleInstance\0"
            .encode_utf16()
            .collect();
        let _mutex = unsafe { CreateMutexW(None, true, PCWSTR(mutex_name.as_ptr())) };
        if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
            utils::log_warn("StellaRecord is already running.");
            std::process::exit(0);
        }
    }
}

pub fn get_polaris_exe_path() -> Option<std::path::PathBuf> {
    Some(utils::get_polaris_install_dir()?.join("Polaris.exe"))
}

pub fn launch_external_process(path: &str) -> Result<(), String> {
    let mut cmd = Command::new(path);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000);

    cmd.spawn()
        .map_err(|err| utils::command_err(&format!("起動に失敗しました [{}]", path), err))?;
    Ok(())
}

pub fn get_polaris_status() -> bool {
    let mut system = System::new_all();
    system.refresh_processes(ProcessesToUpdate::All, true);
    system.processes().values().any(|process| {
        let process_name = process.name().to_string_lossy().to_lowercase();
        process_name == "polaris.exe" || process_name == "polaris"
    })
}
