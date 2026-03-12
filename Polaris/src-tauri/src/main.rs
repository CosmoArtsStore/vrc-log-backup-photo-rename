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
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

const ICON_BYTES: &[u8] = include_bytes!("../icon.ico");

// ── パス構築 ────────────────────────────────

fn get_component_install_dir(name: &str) -> Option<PathBuf> {
    let key_path = format!("Software\\CosmoArtsStore\\STELLAProject\\{}", name);
    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(&key_path).ok()?;
    let path: String = key.get_value("InstallLocation").ok()?;
    Some(PathBuf::from(path))
}

fn get_vrchat_log_dir() -> Option<PathBuf> {
    let local = dirs::data_local_dir()?;
    let appdata = local.parent()?;
    Some(appdata.join("LocalLow").join("VRChat").join("VRChat"))
}

/// NSISが書き込んだレジストリからインストール先を取得する
fn install_dir() -> Option<PathBuf> {
    get_component_install_dir("Polaris")
}

fn vrchat_log_dir() -> Option<PathBuf> {
    get_vrchat_log_dir()
}
fn archive_dir() -> Option<PathBuf> {
    Some(install_dir()?.join("archive"))
}
fn log_path() -> Option<PathBuf> {
    Some(install_dir()?.join("info.log"))
}

// ── メイン ────────────────────────────────────────

fn main() {
    // #19: Panic Hookの設定 — リリースビルドでのサイレントクラッシュを防止
    std::panic::set_hook(Box::new(|info| {
        let location = info.location()
            .map(|l| format!("at {}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "unknown location".to_string());
        let payload = info.payload();
        let msg = if let Some(s) = payload.downcast_ref::<&str>() {
            "Alpheratz"
        } else {
            "致命的なエラーが発生しました。"
        };
        
        let error_msg = format!(
            "STELLARECORD (Polaris) で致命的なエラーが発生しました。\n\nエラー内容: {}\n発生場所: {}\n\nアプリケーションを終了します。\n詳細はインストール先の info.log を確認してください。",
            msg, location
        );
        if let Some(path) = log_path() {
            if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
                let now = Local::now().format("%Y-%m-%d %H:%M:%S");
                let _ = writeln!(f, "[{}] [PANIC] {} {}", now, msg, location);
            }
        }
        log_err(&error_msg);
    }));

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
        .with_tooltip("STELLA RECORD - Polaris")
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
    let dst_dir = match archive_dir() {
        Some(d) => d,
        None => { log_err("インストール先をレジストリから取得できません"); return; }
    };
    if let Err(e) = fs::create_dir_all(&dst_dir) {
        log_err(&format!("Cannot create archive dir ({}): {}", dst_dir.display(), e));
        return;
    }

    let log_dir = match vrchat_log_dir() {
        Some(d) => d,
        None => { log_err("AppDataが取得できません"); return; }
    };
    let Ok(entries) = fs::read_dir(&log_dir) else {
        log_err("Cannot read VRChat log dir");
        return;
    };

    for entry_res in entries {
        let entry = match entry_res {
            Ok(e) => e,
            Err(e) => {
                log_err(&format!("Entry read error: {}", e));
                continue;
            }
        };
        let src = entry.path();

        // パスからファイル名抽出。撮れない場合、警告ログ出力し、スキップする。
        let Some(name) = src.file_name().and_then(|n| n.to_str()).map(str::to_string) else {
            log_warn(&format!("unexpected error (line {})", line!()));
            continue;
        };
        let dst = dst_dir.join(&name);

        // output_log_*.txt 以外はスキップ
        if !name.starts_with("output_log_") || !name.ends_with(".txt") { continue; }

        let Ok(src_meta) = fs::metadata(&src) else {
            log_err(&format!("stat src [{}]: failed", name));
            continue;
        };
        let src_size = src_meta.len();
        let src_mtime = src_meta.modified().ok();
        
        let dst_meta = fs::metadata(&dst).ok();
        let dst_size = dst_meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let dst_mtime = dst_meta.and_then(|m| m.modified().ok());

        // 同期が必要かどうかの判断
        let needs_copy = if dst_size == 0 {
            true
        } else if src_size > dst_size {
            true
        } else if src_size == dst_size {
            // サイズ同じでも、更新日時が進んでいれば（中身が書き換わっている可能性）念のため
            match (src_mtime, dst_mtime) {
                (Some(sm), Some(dm)) => sm > dm,
                _ => false,
            }
        } else {
            // src_size < dst_size: 想定外
            log_err(&format!("src smaller than dst [{}]: src={} dst={}", name, src_size, dst_size));
            false
        };

        if !needs_copy {
            continue;
        }

        if src_size == dst_size {
            log_warn(&format!("src size same as dst but mtime is newer [{}]: re-copying", name));
        } else if dst_size > 0 && src_size > dst_size {
            // 追記された場合など
        }

        if let Err(e) = fs::copy(&src, &dst) {
            // EAC等の競合で標準の copy が失敗した場合のフォールバック
            #[cfg(windows)]
            {
                use std::os::windows::fs::OpenOptionsExt;
                use windows::Win32::Storage::FileSystem::FILE_SHARE_READ;
                
                let res = fs::OpenOptions::new()
                    .read(true)
                    .share_mode(FILE_SHARE_READ.0)
                    .open(&src)
                    .and_then(|mut s_file| {
                        let mut d_file = fs::File::create(&dst)?;
                        std::io::copy(&mut s_file, &mut d_file)
                    });
                
                if let Err(e2) = res {
                    log_err(&format!("copy failed (share mode fallback also failed) [{}]: {} / {}", name, e, e2));
                }
            }
            #[cfg(not(windows))]
            {
                log_err(&format!("copy failed [{}]: {}", name, e));
            }
        }
    }
}

// ── エラーログ ──────────────────────────────────────

/// WARN / ERROR のみ記録（正常な動作はログに残さない）
fn log_msg(level: &str, msg: &str) {
    if let Some(path) = log_path() {
        if let Ok(mut log) = OpenOptions::new().create(true).append(true).open(path) {
            let now = Local::now().format("%Y-%m-%d %H:%M:%S");
            let _ = writeln!(log, "[{}] [{}] {}", now, level, msg);
        }
    }
}

fn log_warn(msg: &str) { log_msg("WARN",  msg); }
fn log_err (msg: &str) { log_msg("ERROR", msg); }