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

    let _single_instance_guard = match create_single_instance_guard() {
        Ok(handle) => handle,
        Err(true) => {
            utils::log_warn("another Polaris instance is already running; exiting duplicate process");
            return;
        }
        Err(false) => {
            utils::log_warn("single instance guard could not be confirmed; continuing to avoid monitor outage");
            None
        }
    };

    // 起動直後に VRChat が落ちているなら、その時点で取れるログを先に退避しておく。
    if platform::find_vrchat_pid(&mut System::new()).is_none() {
        sync::sync_logs();
    }

    start_monitor_thread();

    match TrayRuntime::build() {
        Ok(runtime) => runtime.run_message_loop(),
        Err(err) => {
            utils::log_err(&format!("tray init failed; keeping background monitor alive: {}", err));
            run_headless_message_loop();
        }
    }
}

fn create_single_instance_guard() -> Result<Option<windows::Win32::Foundation::HANDLE>, bool> {
    let mutex_name: Vec<u16> = "Global\\Polaris_SingleInstance\0".encode_utf16().collect();
    let mutex = unsafe { CreateMutexW(None, true, PCWSTR(mutex_name.as_ptr())) };
    match mutex {
        Ok(handle) => {
            if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
                let _ = unsafe { CloseHandle(handle) };
                Err(true)
            } else {
                Ok(Some(handle))
            }
        }
        Err(err) => {
            utils::log_warn(&format!(
                "CreateMutexW failed while creating single instance guard: {}",
                err
            ));
            Err(false)
        }
    }
}

fn start_monitor_thread() {
    thread::spawn(move || {
        let mut system = System::new();

        loop {
            let iteration_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                monitor_once(&mut system)
            }));

            match iteration_result {
                Ok(Ok(())) => {}
                Ok(Err(err)) => {
                    utils::log_err(&format!("monitor iteration failed: {}", err));
                }
                Err(_) => {
                    // panic hook 側でも詳細は残す。ここでは監視ループ自体を落とさないことを優先する。
                    utils::log_err("monitor iteration panicked; restarting loop");
                }
            }

            thread::sleep(Duration::from_secs(10));
        }
    });
}

fn monitor_once(system: &mut System) -> Result<(), String> {
    let Some(pid) = platform::find_vrchat_pid(system) else {
        return Ok(());
    };

    let process_handle = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, false, pid) }
        .map_err(|err| utils::platform_err("OpenProcess failed while watching VRChat", err))?;

    wait_for_process_exit(process_handle);
    sync::sync_logs();
    Ok(())
}

fn wait_for_process_exit(process_handle: windows::Win32::Foundation::HANDLE) {
    unsafe {
        // Polaris は「VRChat 終了後にログを回収する」常駐監視役なので、対象プロセスの終了を待つ。
        WaitForSingleObject(process_handle, INFINITE);
        // Intentional: OS ハンドル解放失敗で常駐を止める価値はないため、最後にログだけ残して継続する。
        if let Err(err) = CloseHandle(process_handle) {
            utils::log_warn(&format!("CloseHandle failed after VRChat exit wait: {}", err));
        }
    }
}

fn run_headless_message_loop() {
    loop {
        thread::sleep(Duration::from_secs(60));
    }
}
