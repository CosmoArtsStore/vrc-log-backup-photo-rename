#![windows_subsystem = "windows"]

mod bootstrap;

use std::fs;
use std::path::Path;
use std::time::Duration;

use anyhow::{anyhow, bail, Context, Result};
use log::{error, info};
use sysinfo::{ProcessesToUpdate, System};
use tempfile::NamedTempFile;
use windows::core::PCWSTR;
use windows::Win32::Foundation::{
    CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HANDLE, WAIT_FAILED,
};
use windows::Win32::System::Threading::{
    CreateMutexW, OpenProcess, WaitForSingleObject, INFINITE, PROCESS_SYNCHRONIZE,
};

use crate::bootstrap::{
    build_runtime_paths, init_logger, install_panic_hook, read_install_dir_from_registry, RuntimePaths,
};

fn main() {
    let _single_instance_guard = create_single_instance_guard();
    let install_dir = match read_install_dir_from_registry() {
        Ok(path) => path,
        Err(err) => {
            eprintln!("{err}");
            return;
        }
    };
    if !install_dir.is_dir() {
        eprintln!("インストール先フォルダが見つかりません。再インストールしてください。");
        return;
    }
    let runtime_paths = build_runtime_paths(install_dir);

    if let Err(err) = init_logger(&runtime_paths.log_path) {
        eprintln!("ログ初期化に失敗しました: {err}");
        return;
    }
    install_panic_hook();

    run_initial_cycle(&runtime_paths);
    run_monitor_loop(&runtime_paths);
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

fn run_initial_cycle(runtime_paths: &RuntimePaths) {
    let mut system = System::new();
    if let Some(pid) = find_vrchat_pid(&mut system) {
        if let Err(err) = wait_for_vrchat_exit(pid) {
            error!("起動直後のVRChat待機に失敗しました: {err}");
        } else {
            backup_logs(runtime_paths);
        }
    } else {
        backup_logs(runtime_paths);
    }
}

fn run_monitor_loop(runtime_paths: &RuntimePaths) {
    let mut system = System::new();

    loop {
        if let Some(pid) = find_vrchat_pid(&mut system) {
            match wait_for_vrchat_exit(pid) {
                Ok(()) => backup_logs(runtime_paths),
                Err(err) => error!("VRChatの終了待機に失敗しました: {err}"),
            }
        }

        std::thread::sleep(Duration::from_secs(10));
    }
}

fn find_vrchat_pid(system: &mut System) -> Option<u32> {
    system.refresh_processes(ProcessesToUpdate::All, false);
    system
        .processes()
        .values()
        .find(|process| match process.name().to_string_lossy() {
            name if name.eq_ignore_ascii_case("vrchat.exe") => true,
            name if name.eq_ignore_ascii_case("vrchat") => true,
            _ => false,
        })
        .map(|process| process.pid().as_u32())
}

fn wait_for_vrchat_exit(pid: u32) -> Result<()> {
    let process_handle = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, false, pid) }
        .context("VRChat監視用のプロセスを開けませんでした")?;

    let wait_result = unsafe { WaitForSingleObject(process_handle, INFINITE) };
    unsafe {
        if let Err(err) = CloseHandle(process_handle) {
            error!("VRChat待機後のハンドル解放に失敗しました: {err}");
        }
    }
    if wait_result == WAIT_FAILED {
        bail!("VRChatの終了待機に失敗しました。");
    }

    Ok(())
}

fn backup_logs(runtime_paths: &RuntimePaths) {
    let destination_dir = &runtime_paths.archive_dir;
    if let Err(err) = fs::create_dir_all(destination_dir) {
        error!("archiveフォルダを作成できませんでした [{}]: {err}", destination_dir.display());
        return;
    }

    let source_dir = &runtime_paths.vrchat_log_dir;
    let entries = match fs::read_dir(source_dir) {
        Ok(entries) => entries,
        Err(err) => {
            error!("VRChatのログフォルダを開けませんでした [{}]: {err}", source_dir.display());
            return;
        }
    };

    let mut copied_count = 0;
    for entry in entries {
        match backup_log_entry(entry, destination_dir) {
            Ok(true) => copied_count += 1,
            Ok(false) => {}
            Err(err) => error!("{err}"),
        }
    }

    if copied_count > 0 {
        info!("ログを{}件バックアップしました。", copied_count);
    }
}

fn is_backup_target(file_name: &str) -> bool {
    file_name.starts_with("output_log_") && file_name.ends_with(".txt")
}

fn backup_log_entry(entry: std::io::Result<fs::DirEntry>, destination_dir: &Path) -> Result<bool> {
    let entry = entry.context("ログフォルダ内の項目を読めませんでした")?;
    let source_path = entry.path();
    let file_name = source_path
        .file_name()
        .and_then(|name| name.to_str())
        .context("ログファイル名を文字列として解釈できませんでした")?;
    if !is_backup_target(file_name) {
        return Ok(false);
    }

    let source_size = fs::metadata(&source_path)
        .with_context(|| format!("元ログのメタデータを読めませんでした [{}]", file_name))?
        .len();
    let destination_path = destination_dir.join(file_name);
    let destination_size = fs::metadata(&destination_path)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    if destination_size != 0 && source_size <= destination_size {
        return Ok(false);
    }

    copy_log_file(&source_path, &destination_path)
        .with_context(|| format!("ログのコピーに失敗しました [{}]", file_name))?;
    Ok(true)
}

fn copy_log_file(source_path: &Path, destination_path: &Path) -> Result<()> {
    use std::io::{copy, ErrorKind};
    use std::os::windows::fs::OpenOptionsExt;
    use windows::Win32::Storage::FileSystem::{FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE};

    let destination_dir = destination_path
        .parent()
        .context("コピー先フォルダを取得できませんでした")?;
    let mut source_file = fs::OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ.0 | FILE_SHARE_WRITE.0 | FILE_SHARE_DELETE.0)
        .open(source_path)
        .context("コピー元ログを開けませんでした")?;
    let mut temp_file = NamedTempFile::new_in(destination_dir)
        .context("一時ファイルを作成できませんでした")?;

    copy(&mut source_file, &mut temp_file).context("ログファイルのコピーに失敗しました")?;
    temp_file
        .as_file()
        .sync_all()
        .context("一時ファイルを保存できませんでした")?;
    if let Err(err) = fs::remove_file(destination_path) {
        if err.kind() != ErrorKind::NotFound {
            return Err(err).context("既存バックアップを置き換えられませんでした");
        }
    }
    temp_file
        .persist(destination_path)
        .map_err(|err| anyhow!("バックアップを確定できませんでした: {}", err.error))?;

    Ok(())
}
