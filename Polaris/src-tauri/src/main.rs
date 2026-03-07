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
use windows::Win32::Foundation::{ERROR_ALREADY_EXISTS, HANDLE};
use windows::Win32::Storage::FileSystem::*;
use windows::Win32::System::Threading::CreateMutexW;
use windows::Win32::UI::WindowsAndMessaging::{GetMessageW, MSG};
use windows::core::PCWSTR;

const ICON_BYTES: &[u8] = include_bytes!("../icon.ico");

// ── パス ──────────────────────────────────────────

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

// ── エラーログ ────────────────────────────────────

fn init_log() {
    let path = error_log_path();
    if let Some(p) = path.parent() { let _ = fs::create_dir_all(p); }
    let _ = OpenOptions::new().create(true).append(true).open(&path);
}

fn log_err(msg: &str) {
    let path = error_log_path();
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
        let _ = writeln!(f, "[{}] {}", now, msg);
    }
    eprintln!("{}", msg);
}

// ── 同期 ─────────────────────────────────────────

fn sync_logs() {
    let dst_dir = archive_dir();
    if !dst_dir.is_dir() {
        log_err(&format!("[ERROR] Cannot backup: archive directory is missing ({})", dst_dir.display()));
        return;
    }

    let entries = match fs::read_dir(vrchat_log_dir()) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let src = entry.path();
        let name = match src.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if !name.starts_with("output_log_") || !name.ends_with(".txt") { continue; }

        let dst = dst_dir.join(&name);
        let src_size = match fs::metadata(&src) {
            Ok(m) => m.len(),
            Err(e) => { log_err(&format!("Stat src {}: {}", name, e)); continue; }
        };
        if src_size <= fs::metadata(&dst).map(|m| m.len()).unwrap_or(0) { continue; }

        if let Err(e) = copy_shared(&src, &dst) {
            log_err(&format!("copy {}: {}", name, e));
        }
    }
}

fn copy_shared(src: &std::path::Path, dst: &std::path::Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use std::io::Seek;
    let wide: Vec<u16> = src.as_os_str().encode_wide().chain(Some(0)).collect();
    let handle = unsafe {
        CreateFileW(
            PCWSTR(wide.as_ptr()),
            FILE_GENERIC_READ.0,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            None, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, HANDLE::default(),
        )
    }.map_err(|e: windows::core::Error| io::Error::new(io::ErrorKind::Other, e.to_string()))?;

    let mut src_file = unsafe { <fs::File as std::os::windows::io::FromRawHandle>::from_raw_handle(handle.0 as _) };
    
    let dst_size = fs::metadata(dst).map(|m| m.len()).unwrap_or(0);
    src_file.seek(io::SeekFrom::Start(dst_size))?;
    
    let mut dst_file = fs::OpenOptions::new().create(true).append(true).open(dst)?;
    io::copy(&mut src_file, &mut dst_file)?;
    dst_file.flush().map_err(|e| { log_err(&format!("flush dst: {}", e)); e })
}

// ── メイン ────────────────────────────────────────

fn main() {
    // 二重起動防止
    let mutex_name: Vec<u16> = "Global\\Polaris_SingleInstance\0".encode_utf16().collect();
    let _ = unsafe { CreateMutexW(None, true, PCWSTR(mutex_name.as_ptr())) };
    if unsafe { windows::Win32::Foundation::GetLastError() } == ERROR_ALREADY_EXISTS {
        return;
    }

    init_log();
    sync_logs();

    // 定期同期（10分間隔）
    let running = Arc::new(AtomicBool::new(true));
    let running_timer = Arc::clone(&running);
    thread::spawn(move || {
        while running_timer.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_secs(600));
            if running_timer.load(Ordering::Relaxed) { sync_logs(); }
        }
    });

    // トレイアイコン
    let img = image::load_from_memory(ICON_BYTES).expect("icon load failed").into_rgba8();
    let (w, h) = img.dimensions();
    let icon = tray_icon::Icon::from_rgba(img.into_raw(), w, h).expect("icon failed");

    let menu = Menu::new();
    let quit = MenuItem::new("Polaris", true, None);
    let quit_id = quit.id().clone();
    menu.append(&quit).unwrap();

    let _tray = TrayIconBuilder::new()
        .with_icon(icon)
        .with_tooltip("Polaris")
        .with_menu(Box::new(menu))
        .build()
        .expect("tray build failed");

    // GetMessageベースのメッセージループ
    let mut msg = MSG::default();
    loop {
        // メニューイベントチェック
        if let Ok(event) = MenuEvent::receiver().try_recv() {
            if event.id == quit_id { break; }
        }
        // OSメッセージを待機（CPUを使わない）
        unsafe { let _ = GetMessageW(&mut msg, None, 0, 0); };
    }

    running.store(false, Ordering::Relaxed);
    sync_logs();
}