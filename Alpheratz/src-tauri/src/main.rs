#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::panic;
use std::process;

const APP_NAME: &str = "Alpheratz";

/// Windowsネイティブのメッセージボックスを表示する
#[cfg(target_os = "windows")]
fn show_fatal_error(msg: &str) {
    use windows::core::PCWSTR;
    use windows::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

    let title: Vec<u16> = format!("{APP_NAME} 致命的エラー\0")
        .encode_utf16()
        .collect();
    let message: Vec<u16> = format!("{msg}\0").encode_utf16().collect();

    // SAFETY: static UTF-16 buffers are null-terminated and valid for MessageBoxW call duration.
    unsafe {
        MessageBoxW(
            None,
            PCWSTR(message.as_ptr()),
            PCWSTR(title.as_ptr()),
            MB_OK | MB_ICONERROR,
        );
    }
}

#[cfg(not(target_os = "windows"))]
fn show_fatal_error(msg: &str) {
    // Intentional no-op: this app targets Windows-only (VRC users), so non-Windows builds are unsupported.
}

fn main() {
    // 1. パニックフックの設定
    // リリースビルド（Windowsサブシステム）でのサイレントクラッシュを防止
    panic::set_hook(Box::new(|info| {
        let location = match info.location() {
            Some(l) => format!("at {}:{}", l.file(), l.line()),
            None => String::new(),
        };

        let payload = info.payload();
        let payload_msg = if let Some(s) = payload.downcast_ref::<&'static str>() {
            s.to_string()
        } else if let Some(s) = payload.downcast_ref::<String>() {
            s.clone()
        } else {
            "致命的なエラーが発生しました。".to_string()
        };

        let error_msg = format!(
            "STELLAProject (Alpheratz) で致命的なエラーが発生しました。\n\nエラー内容: {}\n発生場所: {}\n\nアプリケーションを終了します。\n詳細はインストール先の info.log を確認してください。",
            payload_msg, location
        );

        // クラッシュログの書き出し
        alpheratz_lib::utils::log_err(&error_msg);

        // ユーザーへの通知
        show_fatal_error(&error_msg);
    }));

    // 2. アプリケーションの実行
    // 戻り値のない run() だが、内部でのパニックは上記のフックで捕捉される
    alpheratz_lib::run();

    // 正常終了
    process::exit(0);
}
