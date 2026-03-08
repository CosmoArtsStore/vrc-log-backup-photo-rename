#![windows_subsystem = "windows"] // コンソールウィンドウを非表示にする

use std::env::var;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::thread;
use std::time::Duration;

use chrono::Local;
use sysinfo::{ProcessesToUpdate, System};
use tray_icon::{Icon, TrayIcon, TrayIconBuilder, menu::{Menu, MenuEvent, MenuId, MenuItem, PredefinedMenuItem}};
use windows::Win32::Foundation::{CloseHandle, ERROR_ALREADY_EXISTS, GetLastError};
use windows::Win32::System::Threading::{CreateMutexW, OpenProcess, WaitForSingleObject, INFINITE, PROCESS_SYNCHRONIZE};
use windows::Win32::UI::WindowsAndMessaging::{DispatchMessageW, MessageBoxW, PeekMessageW, TranslateMessage, IDOK, MB_ICONWARNING, MB_OKCANCEL, MSG, PM_REMOVE};
use windows::core::PCWSTR;

const ICON_BYTES: &[u8] = include_bytes!("../icon.ico");

// ── パス構築 ────────────────────────────────
fn vrchat_log_dir() -> PathBuf { PathBuf::from(var("USERPROFILE").unwrap_or_default()).join("AppData").join("LocalLow").join("VRChat").join("VRChat") }
fn archive_dir() -> PathBuf { PathBuf::from(var("LOCALAPPDATA").unwrap_or_default()).join("CosmoArtsStore").join("STELLAProject").join("Polaris").join("archive") }
fn error_log_path() -> PathBuf { PathBuf::from(var("LOCALAPPDATA").unwrap_or_default()).join("CosmoArtsStore").join("STELLAProject").join("Polaris").join("error_info.log") }

// ── メイン ────────────────────────────────────────

fn main() {
    // 二重起動防止
    let mutex_name: Vec<u16> = "Global\\Polaris_SingleInstance\0".encode_utf16().collect();
    let _ = unsafe { CreateMutexW(None, true, PCWSTR(mutex_name.as_ptr())) };
    if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        return;
    }

    // 起動時同期。VRChat起動中はスキップ。
    if find_vrchat_pid(&mut System::new()).is_none() {
        sync_logs();
    }

    // トレイアイコン構築
    let (quit_id, _tray) = build_tray();

    // 10秒ごとにVRChatをチェックし、確認出来たら終了まで待機、終了後ログをバックアップする。
    thread::spawn(move || {
        let mut sys = System::new();
        loop {
            if let Some(pid) = find_vrchat_pid(&mut sys) {
                if let Ok(handle) = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, false, pid) } {
                    unsafe { WaitForSingleObject(handle, INFINITE) }; 
                    unsafe { CloseHandle(handle).ok() };
                    sync_logs();
                }
            }
            thread::sleep(Duration::from_secs(10));
        }
    });

    // トレイアイコン処理。
    let mut msg = MSG::default();
    loop {
        if let Ok(event) = MenuEvent::receiver().try_recv() {
            if event.id == quit_id {
                let text:  Vec<u16> = "Polarisを停止すると、以降のログバックアップは行われません。\0".encode_utf16().collect();
                let title: Vec<u16> = "Polaris 停止確認\0".encode_utf16().collect();
                let result = unsafe { MessageBoxW(None, PCWSTR(text.as_ptr()), PCWSTR(title.as_ptr()), MB_OKCANCEL | MB_ICONWARNING) };
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
}

// ── トレイアイコン構築 ────────────────────────────

fn build_tray() -> (MenuId, TrayIcon) {
    let img = image::load_from_memory(ICON_BYTES).expect("icon load failed").into_rgba8();
    let (w, h) = img.dimensions();
    let icon = Icon::from_rgba(img.into_raw(), w, h).expect("icon failed");

    let menu = Menu::new();
    let status = MenuItem::new("Polaris 起動中", false, None); 
    let quit   = MenuItem::new("停止", true, None);
    let quit_id = quit.id().clone();
    menu.append(&status).expect("menu append failed");
    menu.append(&PredefinedMenuItem::separator()).expect("menu append failed");
    menu.append(&quit).expect("menu append failed");

    let tray = TrayIconBuilder::new()
        .with_icon(icon)
        .with_tooltip("Polaris")
        .with_menu(Box::new(menu))
        .build()
        .expect("tray build failed");

    (quit_id, tray)
}

// ── VRChatプロセス検索 ────────────────────────────

/// 起動中のVRChatのプロセスIDを返す。見つからない場合はNoneを返す
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

/// VRChatのログファイルをarchiveフォルダへコピーする
fn sync_logs() {
    let dst_dir = archive_dir();
    if let Err(e) = fs::create_dir_all(&dst_dir) {
        log_err(&format!("Cannot create archive dir ({}): {}", dst_dir.display(), e));
        return;
    }

    let Ok(entries) = fs::read_dir(vrchat_log_dir()) else {
        log_err("Cannot read VRChat log dir");
        return;
    };

    for entry in entries.flatten() {
        let src = entry.path();

        // パスからファイル名抽出。撮れない場合、警告ログ出力し、スキップする。
        let Some(name) = src.file_name().and_then(|n| n.to_str()).map(str::to_string) else {
            log_warn(&format!("unexpected error (line {})", line!()));
            continue;
        };

        // output_log_*.txt 以外はスキップ
        if !name.starts_with("output_log_") || !name.ends_with(".txt") { continue; }

        let dst = dst_dir.join(&name);

        let Ok(src_meta) = fs::metadata(&src) else {
            log_err(&format!("stat src [{}]: failed", name));
            continue;
        };
        let src_size = src_meta.len();
        let dst_size = fs::metadata(&dst).map(|m| m.len()).unwrap_or(0);

        if src_size == dst_size && dst_size != 0 {
            // ファイルサイズが同じ場合同期済みとし、スキップする。
            continue; 
        } else if src_size < dst_size {
            // コピー元のファイルサイズが小さい場合、想定外。エラーとしスキップする。
            log_err(&format!("src smaller than dst [{}]: src={} dst={}", name, src_size, dst_size));
            continue;
        } else if dst_size > 0 {
            // コピー元のファイルサイズが大きい場合、警告を記録しつつ一応コピー
            log_warn(&format!("src larger than dst [{}]: src={} dst={}", name, src_size, dst_size));
        }

        if let Err(e) = fs::copy(&src, &dst) {
            log_err(&format!("copy failed [{}]: {}", name, e));
        }
    }
}

// ── エラーログ ──────────────────────────────────────

/// WARN / ERROR のみ記録（正常な動作はログに残さない）
fn log_msg(level: &str, msg: &str) {
    let path = error_log_path();
    if let Ok(mut log) = OpenOptions::new().create(true).append(true).open(&path) {
        let now = Local::now().format("%Y-%m-%d %H:%M:%S");
        let _ = writeln!(log, "[{}] [{}] {}", now, level, msg);
    }
}

fn log_warn(msg: &str) { log_msg("WARN",  msg); }
fn log_err (msg: &str) { log_msg("ERROR", msg); }