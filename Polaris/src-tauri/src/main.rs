#![windows_subsystem = "windows"]

use std::fs;
use std::path::Path;
use std::thread;
use std::time::Duration;
use sysinfo::{System, ProcessesToUpdate};

#[cfg(windows)]
use windows::Win32::System::Threading::CreateMutexW;
#[cfg(windows)]
use windows::Win32::Foundation::{CloseHandle, ERROR_ALREADY_EXISTS};
#[cfg(windows)]
use windows::core::PCWSTR;

fn main() {
    // ---- 二重起動防止 ----
    #[cfg(windows)]
    let _mutex_guard = {
        let name: Vec<u16> = "Global\\Polaris_SingleInstance\0"
            .encode_utf16()
            .collect();
        
        let handle = unsafe {
            CreateMutexW(None, true, PCWSTR(name.as_ptr()))
        };

        match handle {
            Ok(h) if !h.is_invalid() => {
                if unsafe { windows::Win32::Foundation::GetLastError() } == ERROR_ALREADY_EXISTS {
                    // 先行プロセスあり → 即終了
                    unsafe { let _ = CloseHandle(h); };
                    return;
                }
                h // スコープを保持（main終了まで解放しない）
            }
            Ok(_) => {
                // ハンドルが無効（取得失敗）→ ログして終了
                log_startup_error("mutex handle is invalid");
                return;
            }
            Err(e) => {
                // Win32 API レベルの失敗 → ログして終了
                log_startup_error(&format!("CreateMutexW failed: {:?}", e));
                return;
            }
        }
    };

    let mut sys = System::new();
    // 「直前のチェック時にVRCが動いていたか」を記録するフラグ
    let mut vrchat_was_running = is_vrchat_running(&mut sys);

    // 起動時にVRCが起動していない場合、前回のセッションで未取得のログがある可能性があるため同期を実行
    if !vrchat_was_running {
        sync_logs();
    }

    // 無限ループによる常駐監視
    loop {
        // CPU負荷を抑えるため3秒間隔でチェック
        thread::sleep(Duration::from_secs(3));
        
        // 現在のVRC起動状態を取得
        let vrchat_now = is_vrchat_running(&mut sys);

        if vrchat_now && !vrchat_was_running {
            // 状態変化：未起動 -> 起動中
            // 次回から「終了」を検知できるようにフラグを立てる
            vrchat_was_running = true;
        } else if !vrchat_now && vrchat_was_running {
            // 状態変化：起動中 -> 停止した
            // 差分（新規ファイルまたは追記分）のみを取得
            sync_logs();
            
            // 同期が終わったので、次回「起動」を検知できるようにフラグを降ろす
            vrchat_was_running = false;
        }
    }
}

/// VRChatが起動しているかどうかを確認する
/// refresh_processes の第2引数を true に設定し、
/// 終了したプロセスをキャッシュから削除することで正確な状態を維持する
fn is_vrchat_running(sys: &mut System) -> bool {
    // true = 終了したプロセスをキャッシュから削除する（必須設定）
    sys.refresh_processes(ProcessesToUpdate::All, true);
    sys.processes().values().any(|p| {
        let n = p.name().to_string_lossy().to_lowercase();
        n == "vrchat.exe" || n == "vrchat"
    })
}

/// ログをバックアップ先へ同期する（新規またはサイズが増加したファイルのみ）
fn sync_logs() {
    // ソースディレクトリ: %USERPROFILE%\AppData\LocalLow\VRChat\VRChat
    // APPDATA/../LocalLow は環境によって解決が不安定なため USERPROFILE から組み立てる
    let Ok(userprofile) = std::env::var("USERPROFILE") else { return };
    let src_dir = Path::new(&userprofile).join("AppData\\LocalLow\\VRChat\\VRChat");

    let Ok(local_appdata) = std::env::var("LOCALAPPDATA") else { return };
    let dest_dir = Path::new(&local_appdata).join("CosmoArtsStore\\STELLAProject\\Polaris\\archive");
    let log_path = Path::new(&local_appdata).join("CosmoArtsStore\\STELLAProject\\Polaris\\error_info.log");

    if fs::create_dir_all(&dest_dir).is_err() {
        log_error(&log_path, "archive dir creation failed");
        return;
    }

    // ソースディレクトリが存在しない（VRChat未インストール等）はサイレントにスキップ
    if !src_dir.is_dir() {
        return;
    }

    // ログファイルの同期
    let Ok(entries) = fs::read_dir(&src_dir) else { return };

    for entry in entries.flatten() {
        let path = entry.path();

        // ファイル以外はスキップ
        if !path.is_file() {
            continue;
        }

        // output_log_*.txt 以外はスキップ
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !(name.starts_with("output_log_") && name.ends_with(".txt")) {
            continue;
        }

        let dest_path = dest_dir.join(name);

        // 同期判定（差分コピーロジック）
        let src_meta = fs::metadata(&path).ok();
        let dest_meta = fs::metadata(&dest_path).ok();
        let should_copy = match (src_meta, dest_meta) {
            // 元ファイルの方が大きい = 追記されたとみなして上書き同期
            (Some(s), Some(d)) => s.len() > d.len(),
            // バックアップ先に存在しない場合は新規ファイルとしてコピー
            (Some(_), None) => true,
            // ソースのメタデータが取れない場合はスキップ（コピーしても失敗するため）
            (None, _) => false,
        };

        if should_copy && fs::copy(&path, &dest_path).is_err() {
            log_error(&log_path, &format!("copy failed: {}", name));
        }
    }
}

fn log_error(log_path: &Path, msg: &str) {
    if let Some(parent) = log_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let line = format!("[{}] {}\n", chrono::Local::now(), msg);
    let _ = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map(|mut f| std::io::Write::write_all(&mut f, line.as_bytes()));
}

/// ミューテックス取得失敗など、log_path が確定する前の致命的エラーをログする
/// ログ先: %LOCALAPPDATA%\CosmoArtsStore\STELLAProject\Polaris\error_info.log
fn log_startup_error(msg: &str) {
    if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
        let log_path = Path::new(&local_appdata)
            .join("CosmoArtsStore\\STELLAProject\\Polaris\\error_info.log");
        log_error(&log_path, &format!("[STARTUP] {}", msg));
    }
}