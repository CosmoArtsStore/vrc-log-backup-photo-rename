#![windows_subsystem = "windows"]

use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::PathBuf;
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use std::thread;
use std::time::Duration;

use tray_icon::{
    TrayIconBuilder,
    menu::{Menu, MenuItem, MenuEvent},
};
use windows::Win32::Foundation::{ERROR_ALREADY_EXISTS, HANDLE, WAIT_OBJECT_0};
use windows::Win32::Storage::FileSystem::*;
use windows::Win32::System::Threading::{
    CreateMutexW, OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE, INFINITE,
};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW,
    PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::UI::WindowsAndMessaging::{GetMessageW, MSG};
use windows::core::PCWSTR;

const ICON_BYTES: &[u8] = include_bytes!("../icon.ico");

// ── 処理用パス構築 ────────────────────────────────

fn vrchat_log_dir() -> PathBuf {
    PathBuf::from(std::env::var("USERPROFILE").unwrap_or_default())
        .join("AppData").join("LocalLow").join("VRChat").join("VRChat")
}

fn archive_dir() -> PathBuf {
    PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default())
        .join("CosmoArtsStore").join("STELLAProject").join("Polaris").join("archive")
}

fn error_log_path() -> PathBuf {
    PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default())
        .join("CosmoArtsStore").join("STELLAProject").join("Polaris").join("error_info.log")
}

// ── メイン ────────────────────────────────────────

fn main() {
    // 二重起動防止
    let mutex_name: Vec<u16> = "Global\\Polaris_SingleInstance\0".encode_utf16().collect();
    let _ = unsafe { CreateMutexW(None, true, PCWSTR(mutex_name.as_ptr())) };
    if unsafe { windows::Win32::Foundation::GetLastError() } == ERROR_ALREADY_EXISTS {
        return;
    }

    // 起動時初期同期
    sync_logs();

    // トレイアイコン構築（メッセージループ開始前に準備）
    let (quit_id, _tray) = build_tray();

    // 定期同期（1分間隔）
    let running = Arc::new(AtomicBool::new(true));
    let running_timer = Arc::clone(&running);
    thread::spawn(move || {
        while running_timer.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_secs(60));
            if running_timer.load(Ordering::Relaxed) { sync_logs(); }
        }
    });

    // GetMessageベースのメッセージループ（CPUを使わない）
    let mut msg = MSG::default();
    loop {
        if let Ok(event) = MenuEvent::receiver().try_recv() {
            if event.id == quit_id { break; }
        }
        unsafe { let _ = GetMessageW(&mut msg, None, 0, 0); };
    }

    running.store(false, Ordering::Relaxed);

    // VRChatが生きていれば終了を待ってから最終sync
    wait_for_vrchat_then_sync();
}

// ── トレイアイコン構築 ────────────────────────────

fn build_tray() -> (tray_icon::menu::MenuId, tray_icon::TrayIcon) {
    let img = image::load_from_memory(ICON_BYTES).expect("icon load failed").into_rgba8();
    let (w, h) = img.dimensions();
    let icon = tray_icon::Icon::from_rgba(img.into_raw(), w, h).expect("icon failed");

    let menu = Menu::new();
    let quit = MenuItem::new("Polaris", true, None);
    let quit_id = quit.id().clone();
    menu.append(&quit).unwrap();

    let tray = TrayIconBuilder::new()
        .with_icon(icon)
        .with_tooltip("Polaris")
        .with_menu(Box::new(menu))
        .build()
        .expect("tray build failed");

    (quit_id, tray)
}

// ── 同期 ─────────────────────────────────────────

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

        // ファイル名を取得。取れなければスキップ
        let name_os = src.file_name();
        if name_os.is_none() { continue; }
        let name = name_os.unwrap().to_str();
        if name.is_none() { continue; }
        let name = name.unwrap().to_string();

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
    src: &std::path::Path,
    dst: &std::path::Path,
    src_size: u64,
    dst_size: u64,
) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use std::io::Seek;

    // FILE_GENERIC : 自アプリの権限[読み取り専用]
    // FILE_SHARE   : VRChat、および他アプリ側の権限
    let wide: Vec<u16> = src.as_os_str().encode_wide().chain(Some(0)).collect();
    let handle_result = unsafe {
        CreateFileW(
            PCWSTR(wide.as_ptr()),
            FILE_GENERIC_READ.0,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            None, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, HANDLE::default(),
        )
    };
    if handle_result.is_err() {
        return Err(io::Error::new(io::ErrorKind::Other, handle_result.unwrap_err().to_string()));
    }

    let mut src_file = unsafe {
        <fs::File as std::os::windows::io::FromRawHandle>::from_raw_handle(handle_result.unwrap().0 as _)
    };

    // 差分なし → 何もしない
    let offset = dst_size;
    if offset >= src_size {
        return Ok(());
    }

    // dstの末尾バイトからsrcを読んで追記
    src_file.seek(io::SeekFrom::Start(offset))?;
    let mut dst_file = fs::OpenOptions::new().create(true).append(true).open(dst)?;
    io::copy(&mut src_file, &mut dst_file)?;
    dst_file.flush()?;

    Ok(())
}

// ── ログ (WARN / ERROR のみ) ──────────────────────

fn log_msg(level: &str, msg: &str) {
    let path = error_log_path();
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
        let _ = writeln!(f, "[{}] [{}] {}", now, level, msg);
    }
    eprintln!("[{}] {}", level, msg);
}

fn log_warn(msg: &str) { log_msg("WARN",  msg); }
fn log_err (msg: &str) { log_msg("ERROR", msg); }

// ── VRChat終了待機 → 最終sync ─────────────────────

fn wait_for_vrchat_then_sync() {
    let vrchat_pid = find_process_id("VRChat.exe");

    if vrchat_pid.is_none() {
        // VRChatが既に死んでいる → そのまま最終sync
        sync_logs();
        return;
    }

    let pid = vrchat_pid.unwrap();

    // VRChatのプロセスハンドルを取得（終了待機用の権限のみ）
    let handle_result = unsafe {
        OpenProcess(PROCESS_SYNCHRONIZE, false, pid)
    };

    if handle_result.is_err() {
        // ハンドル取得失敗 → 安全のためsyncだけ実行
        log_warn(&format!("OpenProcess failed for VRChat (pid={}), syncing anyway", pid));
        sync_logs();
        return;
    }

    let handle = handle_result.unwrap();

    // VRChatが終了するまで無期限待機（CPUを使わない）
    unsafe { WaitForSingleObject(handle, INFINITE) };

    // 終了確認 → 最終sync
    sync_logs();
}

// ── プロセスID検索 ────────────────────────────────

fn find_process_id(target: &str) -> Option<u32> {
    let snapshot = unsafe {
        CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    };

    if snapshot.is_err() {
        return None;
    }

    let snapshot = snapshot.unwrap();
    let mut entry = PROCESSENTRY32W {
        dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };

    if unsafe { Process32FirstW(snapshot, &mut entry) }.is_err() {
        return None;
    }

    loop {
        // プロセス名をUTF-16からStringに変換して比較
        let name_len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(0);
        let process_name = String::from_utf16_lossy(&entry.szExeFile[..name_len]);

        if process_name.eq_ignore_ascii_case(target) {
            return Some(entry.th32ProcessID);
        }

        if unsafe { Process32NextW(snapshot, &mut entry) }.is_err() {
            break;
        }
    }

    None
}