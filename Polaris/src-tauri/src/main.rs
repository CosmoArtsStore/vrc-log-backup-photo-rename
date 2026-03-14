#![windows_subsystem = "windows"]

mod tray;
mod utils;

use std::fs;
use std::thread;
use std::time::Duration;

use sysinfo::{ProcessesToUpdate, System};
use tray::TrayRuntime;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HANDLE};
use windows::Win32::System::Threading::{
    CreateMutexW, OpenProcess, WaitForSingleObject, INFINITE, PROCESS_SYNCHRONIZE,
};

fn main() {
    utils::install_panic_hook();

    let _single_instance_guard = create_single_instance_guard();

    // 起動時は一度だけ VRChat の状態を見て、動いていなければすぐ差分バックアップする。
    // 動いている場合は、そのセッションが終わるまで待ってから回収する。
    run_initial_cycle();

    let tray_runtime = match TrayRuntime::build() {
        Ok(runtime) => runtime,
        Err(err) => {
            utils::log_err(&format!("tray init failed: {}", err));
            return;
        }
    };

    start_monitor_thread();
    tray_runtime.run_message_loop();
}

fn create_single_instance_guard() -> Option<HANDLE> {
    let mutex_name: Vec<u16> = "Global\\Polaris_SingleInstance\0".encode_utf16().collect();
    let mutex = unsafe { CreateMutexW(None, true, PCWSTR(mutex_name.as_ptr())) }.ok()?;
    if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        let _ = unsafe { CloseHandle(mutex) };
        std::process::exit(0);
    }
    Some(mutex)
}

fn run_initial_cycle() {
    let mut system = System::new();
    match find_vrchat_pid(&mut system) {
        Some(pid) => {
            if let Err(err) = wait_for_vrchat_exit(pid) {
                utils::log_err(&format!("initial VRChat wait failed: {}", err));
            } else {
                backup_logs();
            }
        }
        None => backup_logs(),
    }
}

fn start_monitor_thread() {
    thread::spawn(move || {
        let mut system = System::new();

        loop {
            if let Some(pid) = find_vrchat_pid(&mut system) {
                match wait_for_vrchat_exit(pid) {
                    Ok(()) => backup_logs(),
                    Err(err) => utils::log_err(&format!("VRChat wait failed: {}", err)),
                }
            }

            // VRChat が見つからない間は 10 秒ごとに確認し続ける。
            thread::sleep(Duration::from_secs(10));
        }
    });
}

fn find_vrchat_pid(system: &mut System) -> Option<u32> {
    // プロセス一覧を最新化してから、VRChat 本体の PID を探す。
    // PID は「いま動いている VRChat を待つための番号」だと考えれば十分。
    system.refresh_processes(ProcessesToUpdate::All, false);
    system
        .processes()
        .values()
        .find(|process| {
            let process_name = process.name().to_string_lossy();
            process_name.eq_ignore_ascii_case("vrchat.exe")
                || process_name.eq_ignore_ascii_case("vrchat")
        })
        .map(|process| process.pid().as_u32())
}

fn wait_for_vrchat_exit(pid: u32) -> Result<(), String> {
    let process_handle = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, false, pid) }
        .map_err(|err| utils::platform_err("OpenProcess failed while watching VRChat", err))?;

    unsafe {
        // ここでやっているのは「VRChat が閉じられるまで待つ」だけ。
        // 終了後にログファイルの内容が固まるので、その直後にバックアップする。
        WaitForSingleObject(process_handle, INFINITE);
        if let Err(err) = CloseHandle(process_handle) {
            utils::log_warn(&format!(
                "CloseHandle failed after VRChat exit wait: {}",
                err
            ));
        }
    }

    Ok(())
}

fn backup_logs() {
    // 常駐アプリなので、一部ファイルの失敗で全体停止しない。
    // 取れたファイルだけを退避し、失敗はログに残して次へ進む。
    let destination_dir = match utils::archive_dir() {
        Some(path) => path,
        None => {
            utils::log_err("install directory for Polaris was not found");
            return;
        }
    };

    if let Err(err) = fs::create_dir_all(&destination_dir) {
        utils::log_err(&format!(
            "archive directory could not be created [{}]: {}",
            destination_dir.display(),
            err
        ));
        return;
    }

    let source_dir = match vrchat_log_dir() {
        Some(path) => path,
        None => {
            utils::log_err("VRChat log directory could not be resolved");
            return;
        }
    };

    let entries = match fs::read_dir(&source_dir) {
        Ok(entries) => entries,
        Err(err) => {
            utils::log_err(&format!(
                "VRChat log directory could not be read [{}]: {}",
                source_dir.display(),
                err
            ));
            return;
        }
    };

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(err) => {
                utils::log_warn(&format!("directory entry read failed: {}", err));
                continue;
            }
        };

        let source_path = entry.path();
        let Some(file_name) = source_path.file_name().and_then(|name| name.to_str()) else {
            utils::log_warn("log file name could not be decoded as text");
            continue;
        };

        if !is_backup_target(file_name) {
            continue;
        }

        let source_size = match fs::metadata(&source_path) {
            Ok(metadata) => metadata.len(),
            Err(err) => {
                utils::log_warn(&format!(
                    "source metadata read failed [{}]: {}",
                    file_name, err
                ));
                continue;
            }
        };

        let destination_path = destination_dir.join(file_name);
        let destination_size = fs::metadata(&destination_path)
            .map(|metadata| metadata.len())
            .unwrap_or(0);

        // バックアップ対象は文書どおりに限定する。
        // 1. output_log_*.txt である
        // 2. コピー先にまだ無い
        // 3. 既存より大きい
        if destination_size != 0 && source_size <= destination_size {
            continue;
        }

        if let Err(copy_err) = copy_log_file(&source_path, &destination_path) {
            utils::log_err(&format!("log copy failed [{}]: {}", file_name, copy_err));
        }
    }
}

fn is_backup_target(file_name: &str) -> bool {
    file_name.starts_with("output_log_") && file_name.ends_with(".txt")
}

fn vrchat_log_dir() -> Option<std::path::PathBuf> {
    // VRChat のログは Windows のユーザーデータ配下にある固定フォルダへ出る。
    let local_dir = dirs::data_local_dir()?;
    let appdata_dir = local_dir.parent()?;
    Some(appdata_dir.join("LocalLow").join("VRChat").join("VRChat"))
}

fn copy_log_file(
    source_path: &std::path::Path,
    destination_path: &std::path::Path,
) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::io::copy;
        use std::os::windows::fs::OpenOptionsExt;
        use windows::Win32::Storage::FileSystem::{
            FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
        };

        // 読み取り専用で開きつつ、VRChat 側には読み書き削除を許可したままにする。
        // つまり Polaris は邪魔せず、相手のファイル利用をブロックしない。
        let mut source_file = fs::OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ.0 | FILE_SHARE_WRITE.0 | FILE_SHARE_DELETE.0)
            .open(source_path)
            .map_err(|err| utils::platform_err("source open failed", err))?;
        let mut destination_file = fs::File::create(destination_path)
            .map_err(|err| utils::platform_err("destination create failed", err))?;

        copy(&mut source_file, &mut destination_file)
            .map_err(|err| utils::platform_err("file copy failed", err))?;
        Ok(())
    }

    #[cfg(not(windows))]
    {
        fs::copy(source_path, destination_path)
            .map(|_| ())
            .map_err(|err| utils::platform_err("file copy failed", err))
    }
}
