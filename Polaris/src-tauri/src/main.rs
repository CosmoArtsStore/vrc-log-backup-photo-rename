#![windows_subsystem = "windows"]

mod platform;
mod sync;
mod tray;
mod utils;

use std::thread;
use std::time::Duration;

use sysinfo::System;
use tray::TrayRuntime;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS};
use windows::Win32::System::Threading::{
    CreateMutexW, OpenProcess, WaitForSingleObject, INFINITE, PROCESS_SYNCHRONIZE,
};

fn main() {
    utils::install_panic_hook();

    let mutex_name: Vec<u16> = "Global\\Polaris_SingleInstance\0".encode_utf16().collect();
    let _mutex = unsafe { CreateMutexW(None, true, PCWSTR(mutex_name.as_ptr())) };
    if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        return;
    }

    if platform::find_vrchat_pid(&mut System::new()).is_none() {
        sync::sync_logs();
    }

    let tray_runtime = match TrayRuntime::build() {
        Ok(runtime) => runtime,
        Err(err) => {
            utils::log_err(&format!("tray init failed: {}", err));
            return;
        }
    };

    thread::spawn(move || {
        let mut system = System::new();
        loop {
            if let Some(pid) = platform::find_vrchat_pid(&mut system) {
                if let Ok(handle) = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, false, pid) } {
                    unsafe {
                        WaitForSingleObject(handle, INFINITE);
                        let _ = CloseHandle(handle);
                    }
                    sync::sync_logs();
                }
            }

            thread::sleep(Duration::from_secs(10));
        }
    });

    tray_runtime.run_message_loop();
}
