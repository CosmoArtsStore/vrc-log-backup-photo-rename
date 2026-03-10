#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::panic;
use std::process;
use std::fs;

/// Windowsネイティブのメッセージボックスを表示する
#[cfg(target_os = "windows")]
fn show_fatal_error(msg: &str) {
    use windows::core::PCWSTR;
    use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

    let title: Vec<u16> = "Alpheratz - Critical Error\0"
        .encode_utf16()
        .collect();
    let message: Vec<u16> = format!("{msg}\0")
        .encode_utf16()
        .collect();

    unsafe {
        let _ = MessageBoxW(
            None,
            PCWSTR(message.as_ptr()),
            PCWSTR(title.as_ptr()),
            MB_OK | MB_ICONERROR,
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn show_fatal_error(msg: &str) {
    eprintln!("{}", msg);
}

fn main() {
    // 1. パニックフックの設定
    // リリースビルド（Windowsサブシステム）でのサイレントクラッシュを防止
    panic::set_hook(Box::new(|info| {
        let location = info.location()
            .map(|l| format!("at {}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "unknown location".to_string());
        
        let payload = info.payload();
        let payload_msg = if let Some(s) = payload.downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = payload.downcast_ref::<String>() {
            s.clone()
        } else {
            "No error message provided".to_string()
        };

        let error_msg = format!(
            "A fatal error occurred in Alpheratz.\n\nError: {}\nLocation: {}\n\nThe application will be terminated.\nFor details, check crash.log in the application folder.",
            payload_msg, location
        );

        // クラッシュログの書き出し
        if let Ok(mut path) = std::env::current_exe() {
            path.set_extension("crash.log");
            let _ = fs::write(path, &error_msg);
        }

        // ユーザーへの通知
        show_fatal_error(&error_msg);
    }));

    // 2. アプリケーションの実行
    // 戻り値のない run() だが、内部でのパニックは上記のフックで捕捉される
    alpheratz_lib::run();

    // 正常終了
    process::exit(0);
}
