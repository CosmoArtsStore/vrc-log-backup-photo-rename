#![windows_subsystem = "windows"]

mod config;
mod logger;

use config::{load_setting, PolarisSetting};
use logger::{log_info, truncate_log};
use sysinfo::{System, ProcessesToUpdate};
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

// §4.2 バックアップ対象
// %APPDATA%\..\LocalLow\VRChat\VRChat\output_log*.txt → archivePath へコピー
fn backup_logs(setting: &PolarisSetting) -> usize {
    let appdata = match std::env::var("APPDATA") {
        Ok(v) => v,
        Err(_) => {
            log_info("Polaris", "APPDATA 取得失敗");
            return 0;
        }
    };
    let src_dir = Path::new(&appdata).join("..\\LocalLow\\VRChat\\VRChat");
    let dest_dir = match setting.get_effective_archive_dir() {
        Ok(d) => d,
        Err(e) => {
            log_info("Polaris", &format!("archiveパス取得失敗: {}", e));
            return 0;
        }
    };

    if !dest_dir.exists() {
        if let Err(e) = fs::create_dir_all(&dest_dir) {
            log_info("Polaris", &format!("archiveディレクトリ作成失敗: {}", e));
            return 0;
        }
    }

    let mut count = 0;
    if let Ok(entries) = fs::read_dir(&src_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.starts_with("output_log_") && name.ends_with(".txt") {
                        let dest_path = dest_dir.join(name);
                        if !dest_path.exists() {
                            if fs::copy(&path, &dest_path).is_ok() {
                                count += 1;
                            }
                        } else {
                            // 更新日時が新しければ上書き
                            if let (Ok(sm), Ok(dm)) = (fs::metadata(&path), fs::metadata(&dest_path)) {
                                if let (Ok(st), Ok(dt)) = (sm.modified(), dm.modified()) {
                                    if st > dt && fs::copy(&path, &dest_path).is_ok() {
                                        count += 1;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    count
}

/// §4.2③ archivePath のディレクトリサイズを計算し閾値超過時に警告を出力
fn check_capacity(setting: &PolarisSetting) {
    if let Ok(archive_dir) = setting.get_effective_archive_dir() {
        if archive_dir.exists() {
            let total: u64 = walkdir_size(&archive_dir);
            if total >= setting.capacityThresholdBytes {
                let gb = total as f64 / 1_073_741_824.0;
                let threshold_gb = setting.capacityThresholdBytes as f64 / 1_073_741_824.0;
                log_info("Polaris", &format!(
                    "[WARNING] archiveが容量警告閾値を超過しています: {:.2} GB / {:.2} GB",
                    gb, threshold_gb
                ));
            }
        }
    }
}

fn walkdir_size(dir: &Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                total += fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
            } else if p.is_dir() {
                total += walkdir_size(&p);
            }
        }
    }
    total
}

fn main() {
    // §4.3 起動毎にログを上書き初期化
    truncate_log();
    log_info("Polaris", "起動しました");

    // §4.2① PolarisSetting.json を tmp コピーして読み込む（共有違反ガード）
    let setting = load_setting_with_tmp_copy();
    log_info("Polaris", &format!("設定読み込み完了: archive={}", setting.archivePath));

    // §4.2① 起動時バックアップ
    let count = backup_logs(&setting);
    log_info("Polaris", &format!("起動時バックアップ完了: {}件", count));

    // §4.2③ 起動時容量チェック
    check_capacity(&setting);

    // §4.6 RegisterApplicationRestart — クラッシュ時の自動再起動（60秒以降のクラッシュが対象）
    register_application_restart();

    // §4.2② VRChat 監視ループを別スレッドで起動
    let setting_arc = Arc::new(Mutex::new(setting));
    let setting_clone = setting_arc.clone();

    thread::spawn(move || {
        let mut vrchat_was_running = false;
        loop {
            thread::sleep(Duration::from_secs(5));

            let mut sys = System::new();
            sys.refresh_processes(ProcessesToUpdate::All, true);

            let vrchat_now = sys.processes().values()
                .any(|p| {
                    let n = p.name().to_string_lossy().to_lowercase();
                    n == "vrchat.exe" || n == "vrchat"
                });

            if vrchat_now && !vrchat_was_running {
                log_info("Polaris", "VRChat 起動を検知しました");
                vrchat_was_running = true;
            }

            if !vrchat_now && vrchat_was_running {
                log_info("Polaris", "VRChat 終了を検知しました。バックアップを実行します...");
                // 設定を再読み込み（STELLA_RECORD が変更している可能性があるため）
                let current_setting = load_setting_with_tmp_copy();
                {
                    let mut s = setting_clone.lock().unwrap();
                    *s = current_setting.clone();
                }
                let count = backup_logs(&current_setting);
                log_info("Polaris", &format!("終了時バックアップ完了: {}件", count));
                check_capacity(&current_setting);
                vrchat_was_running = false;
            }
        }
    });

    // §4.5 タスクトレイ — tray-icon + tao イベントループ
    run_tray_loop();
}

/// §4.2① PolarisSetting.json を tmp コピーしてから読み込むガード
fn load_setting_with_tmp_copy() -> PolarisSetting {
    if let Ok(path) = config::get_setting_path() {
        if path.exists() {
            let tmp_path = path.with_extension("json.tmp");
            if fs::copy(&path, &tmp_path).is_ok() {
                if let Ok(content) = fs::read_to_string(&tmp_path) {
                    if let Ok(s) = serde_json::from_str::<PolarisSetting>(&content) {
                        let _ = fs::remove_file(&tmp_path);
                        return s;
                    }
                }
                let _ = fs::remove_file(&tmp_path);
            }
        }
    }
    PolarisSetting::default()
}

/// §4.6 RegisterApplicationRestart — 起動60秒後以降のクラッシュを自動再起動
fn register_application_restart() {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use winapi::um::winbase::RegisterApplicationRestart;

    let empty: Vec<u16> = OsStr::new("").encode_wide().chain(std::iter::once(0)).collect();
    unsafe {
        // RESTART_NO_CRASH(1) | RESTART_NO_HANG(2) | RESTART_NO_PATCH(4) | RESTART_NO_REBOOT(8) = 0x0000000F
        // 0 = すべての状況でリスタートを許可
        RegisterApplicationRestart(empty.as_ptr(), 0);
    }
}

/// §4.5 タスクトレイ: 右クリック → 「終了」 で正常終了
fn run_tray_loop() {
    use tao::event_loop::{ControlFlow, EventLoopBuilder};
    use tray_icon::{
        menu::{Menu, MenuItem, MenuEvent},
        TrayIconBuilder,
    };

    let event_loop = EventLoopBuilder::new().build();
    let menu = Menu::new();
    let quit_item = MenuItem::new("終了", true, None);
    let quit_id = quit_item.id().clone();
    menu.append(&quit_item).unwrap();

    let _tray = TrayIconBuilder::new()
        .with_menu(Box::new(menu))
        .with_tooltip("Polaris - VRChat ログバックアップ")
        .build()
        .expect("Failed to create tray icon");

    let menu_channel = MenuEvent::receiver();

    event_loop.run(move |_event, _, control_flow| {
        *control_flow = ControlFlow::Wait;
        if let Ok(menu_event) = menu_channel.try_recv() {
            if menu_event.id == quit_id {
                log_info("Polaris", "ユーザーによる正常終了");
                *control_flow = ControlFlow::Exit;
            }
        }
    });
}

