#![windows_subsystem = "windows"]

use std::env::var;
use std::fs::{self, File, OpenOptions};
use std::io::{self, ErrorKind, Seek, SeekFrom, Write};
use std::os::windows::ffi::OsStrExt;
use std::os::windows::io::FromRawHandle;
use std::path::{Path, PathBuf};
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use std::thread;
use std::time::Duration;

use chrono::Local;
use sysinfo::{ProcessesToUpdate, System};
use tray_icon::{
    Icon, TrayIcon, TrayIconBuilder,
    menu::{Menu, MenuEvent, MenuId, MenuItem, PredefinedMenuItem},
};
use windows::Win32::Foundation::{CloseHandle, ERROR_ALREADY_EXISTS, GetLastError, HANDLE};
use windows::Win32::Storage::FileSystem::*;
use windows::Win32::System::Threading::{
    CreateMutexW, OpenProcess, WaitForSingleObject,
    INFINITE, PROCESS_SYNCHRONIZE,
};
use windows::Win32::UI::WindowsAndMessaging::{
    DispatchMessageW, MessageBoxW, PeekMessageW, TranslateMessage,
    IDOK, MB_ICONWARNING, MB_OKCANCEL, MSG, PM_REMOVE,
};
use windows::core::PCWSTR;

const ICON_BYTES: &[u8] = include_bytes!("../icon.ico");

// ── パス構築 ────────────────────────────────

fn vrchat_log_dir() -> PathBuf {
    PathBuf::from(var("USERPROFILE").unwrap_or_default())
        .join("AppData").join("LocalLow").join("VRChat").join("VRChat")
}

fn archive_dir() -> PathBuf {
    PathBuf::from(var("LOCALAPPDATA").unwrap_or_default())
        .join("CosmoArtsStore").join("STELLAProject").join("Polaris").join("archive")
}

fn error_log_path() -> PathBuf {
    PathBuf::from(var("LOCALAPPDATA").unwrap_or_default())
        .join("CosmoArtsStore").join("STELLAProject").join("Polaris").join("error_info.log")
}

// ── メイン ────────────────────────────────────────

fn main() {
    // 二重起動防止
    let mutex_name: Vec<u16> = "Global\\Polaris_SingleInstance\0".encode_utf16().collect();
    let _ = unsafe { CreateMutexW(None, true, PCWSTR(mutex_name.as_ptr())) };
    if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        return;
    }

    // 起動時初期同期
    sync_logs();

    // トレイアイコン構築
    let (quit_id, _tray) = build_tray();

    // VRChat終了検知→同期
    let running = Arc::new(AtomicBool::new(true));
    let running_watcher = Arc::clone(&running);
    thread::spawn(move || {
        let mut sys = System::new();
        while running_watcher.load(Ordering::Relaxed) {
            if let Some(pid) = find_vrchat_pid(&mut sys) {
                if let Ok(handle) = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, false, pid) } {
                    // VRChat終了まで待機
                    unsafe { WaitForSingleObject(handle, INFINITE) };
                    unsafe { CloseHandle(handle).ok() };
                    sync_logs(); // 終了後に同期
                }
            }
            thread::sleep(Duration::from_secs(5)); // 5秒おきにプロセス探す
        }
    });

    // メッセージループ
    let mut msg = MSG::default();
    loop {
        if let Ok(event) = MenuEvent::receiver().try_recv() {
            if event.id == quit_id {
                let text:  Vec<u16> = "Polarisを停止するとVRChatのログバックアップが行われなくなります。\n本当に停止しますか？\0".encode_utf16().collect();
                let title: Vec<u16> = "Polaris 停止確認\0".encode_utf16().collect();
                let result = unsafe {
                    MessageBoxW(None, PCWSTR(text.as_ptr()), PCWSTR(title.as_ptr()), MB_OKCANCEL | MB_ICONWARNING)
                };
                if result == IDOK { break; }
            }
        }
        unsafe {
            if PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }
        thread::sleep(Duration::from_millis(100));
    }

    running.store(false, Ordering::Relaxed);
}

// ── トレイアイコン構築 ────────────────────────────

fn build_tray() -> (MenuId, TrayIcon) {
    let img = image::load_from_memory(ICON_BYTES).expect("icon load failed").into_rgba8();
    let (w, h) = img.dimensions();
    let icon = Icon::from_rgba(img.into_raw(), w, h).expect("icon failed");

    let menu = Menu::new();
    let status = MenuItem::new("Polaris 起動中", false, None); // 表示のみ（クリック不可）
    let quit   = MenuItem::new("停止", true, None);
    let quit_id = quit.id().clone();
    menu.append(&status).unwrap();
    menu.append(&PredefinedMenuItem::separator()).unwrap();
    menu.append(&quit).unwrap();

    let tray = TrayIconBuilder::new()
        .with_icon(icon)
        .with_tooltip("Polaris")
        .with_menu(Box::new(menu))
        .build()
        .expect("tray build failed");

    (quit_id, tray)
}

// ── VRChatプロセス検索 ────────────────────────────

/// sysinfoでプロセス一覧を取得しVRChat.exeのPIDを返す
/// false = CPU/メモリ等の高コスト情報は更新しない（存在確認のみ）
fn find_vrchat_pid(sys: &mut System) -> Option<u32> {
    sys.refresh_processes(ProcessesToUpdate::All, false);
    sys.processes()
        .values()
        .find(|p| {
            let n = p.name().to_string_lossy();
            n.eq_ignore_ascii_case("vrchat.exe") || n.eq_ignore_ascii_case("vrchat")
        })
        .map(|p| p.pid().as_u32())
}

// ── 同期処理 ─────────────────────────────────────────

fn sync_logs() {
    let dst_dir = archive_dir();
    if !dst_dir.is_dir() {
        log_err(&format!("Cannot backup: archive dir missing ({})", dst_dir.display()));
        return;
    }

    let read_result = fs::read_dir(vrchat_log_dir());
    if read_result.is_err() {
        log_err(&format!("Cannot read VRChat log dir: {}", read_result.unwrap_err()));
        return;
    }

    for entry in read_result.unwrap().flatten() {
        let src = entry.path();

        // ファイル名を取得。取れなければスキップ（想定外）
        let name = match src.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None    => {
                log_warn(&format!("unexpected error (line {})", line!()));
                continue;
            }
        };

        // VRChatのログファイル以外はスキップ
        if !name.starts_with("output_log_") || !name.ends_with(".txt") { continue; }

        let dst = dst_dir.join(&name);

        // srcのサイズ取得
        let src_meta = fs::metadata(&src);
        if src_meta.is_err() {
            log_err(&format!("stat src [{}]: {}", name, src_meta.unwrap_err()));
            continue;
        }
        let src_size = src_meta.unwrap().len();

        // dstのサイズ取得（まだなければ0）
        let dst_size = fs::metadata(&dst).map(|m| m.len()).unwrap_or(0);

        // srcがdst以下なら差分なし → スキップ
        if src_size <= dst_size && src_size != 0 { continue; }

        // 差分コピー実行
        let copy_result = copy_shared_diff(&src, &dst, src_size, dst_size);
        if copy_result.is_err() {
            log_err(&format!("copy failed [{}]: {}", name, copy_result.unwrap_err()));
        }
        // 成功はサイレント
    }
}

fn copy_shared_diff(
    src: &Path,
    dst: &Path,
    src_size: u64,
    dst_size: u64,
) -> io::Result<()> {
    // 差分なし → 何もしない
    if dst_size >= src_size {
        return Ok(());
    }

    // FILE_GENERIC : 自アプリの権限[読み取り専用]
    // FILE_SHARE   : VRChat、および他アプリ側の権限
    let wide: Vec<u16> = src.as_os_str().encode_wide().chain(Some(0)).collect();
    let handle = unsafe {
        CreateFileW(
            PCWSTR(wide.as_ptr()),
            FILE_GENERIC_READ.0,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            None, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, HANDLE::default(),
        )
    }.map_err(|e| io::Error::new(ErrorKind::Other, e.to_string()))?;

    let mut src_file = unsafe { File::from_raw_handle(handle.0 as _) };

    // dstの末尾からsrcを読んで追記
    src_file.seek(SeekFrom::Start(dst_size))?;
    let mut dst_file = OpenOptions::new().create(true).append(true).open(dst)?;
    io::copy(&mut src_file, &mut dst_file)?;
    dst_file.flush()
}

// ── ログ (WARN / ERROR のみ) ──────────────────────

fn log_msg(level: &str, msg: &str) {
    let path = error_log_path();
    if let Ok(mut log) = OpenOptions::new().create(true).append(true).open(&path) {
        let now = Local::now().format("%Y-%m-%d %H:%M:%S");
        let _ = writeln!(log, "[{}] [{}] {}", now, level, msg);
    }
}

fn log_warn(msg: &str) { log_msg("WARN",  msg); }
fn log_err (msg: &str) { log_msg("ERROR", msg); }