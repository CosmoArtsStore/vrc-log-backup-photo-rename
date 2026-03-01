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
        let name: Vec<u16> = "Global\\VRCLogSync_SingleInstance\0"
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
            _ => return, // 取得失敗時も終了
        }
    };

    let mut sys = System::new();
    
    // 起動時にVRCが起動していない場合、前回のセッションで未取得のログがある可能性があるため同期を実行
    if !is_vrchat_running(&mut sys) {
        sync_logs();
    }

    // 「直前のチェック時にVRCが動いていたか」を記録するフラグ

    let mut vrchat_was_running = is_vrchat_running(&mut sys);

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
            
            // プロセスが消失した直後はファイルがロックされている可能性があるため3秒待機
            thread::sleep(Duration::from_millis(3000)); 
            
            // 待機後、本当に起動していないことを再確認してから同期を実行
            if !is_vrchat_running(&mut sys) {
                // 差分（新規ファイルまたは追記分）のみを取得
                sync_logs();
            }
            
            // 同期が終わったので、次回「起動」を検知できるようにフラグを降ろす
            vrchat_was_running = false;
        }
    }
}

/// VRChatが起動しているかどうかを確認する
/// refresh_processes の第2引数を false にすることで
/// CPU使用率・メモリ等の重いプロパティ更新をスキップし、
/// プロセスの存在確認のみを最小コストで行う
fn is_vrchat_running(sys: &mut System) -> bool {
    // false = CPU/メモリ等の高コスト情報は更新しない（存在確認のみ）
    sys.refresh_processes(ProcessesToUpdate::All, false);
    sys.processes().values().any(|p| {
        let n = p.name().to_string_lossy().to_lowercase();
        n == "vrchat.exe" || n == "vrchat"
    })
}

/// ログをバックアップ先へ同期する（新規またはサイズが増加したファイルのみ）
fn sync_logs() {
    // ソースディレクトリ: %APPDATA%\..\LocalLow\VRChat\VRChat
    let Ok(appdata) = std::env::var("APPDATA") else { return };
    let src_dir = Path::new(&appdata).join("..\\LocalLow\\VRChat\\VRChat");

    // バックアップ先ディレクトリ: %LOCALAPPDATA%\CosmoArtsStore\STELLARECORD\Polaris\log_archive\
    let Ok(local_appdata) = std::env::var("LOCALAPPDATA") else { return };
    let dest_dir = Path::new(&local_appdata).join("CosmoArtsStore\\STELLARECORD\\Polaris\\log_archive");

    // ディレクトリ作成
    if !dest_dir.exists() {
        let _ = fs::create_dir_all(&dest_dir);
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
            // 存在する場合、ファイルサイズを比較
            // 元ファイルの方が大きい = 追記されたとみなして上書き同期
            (Some(s), Some(d)) => s.len() > d.len(),
            // バックアップ先に存在しない場合は新規ファイルとしてコピー
            (Some(_), None) => true,
            // サイズ取得失敗時は安全のため同期対象とする
            _ => true,
        };

        if should_copy {
            // 差分が確認された場合のみ上書き同期を実行
            let _ = fs::copy(&path, &dest_path);
        }
    }
}