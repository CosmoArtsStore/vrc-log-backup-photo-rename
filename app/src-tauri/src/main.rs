#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::NaiveDateTime;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use app_lib::config::{load_preferences, save_preferences, Preferences};

#[derive(Debug, Serialize, Deserialize)]
pub struct RenamePreview {
    pub old_name: String,
    pub new_name: String,
    pub old_path: String,
    pub new_path: String,
    pub world_name: String,
}

#[derive(Debug)]
struct WorldEvent {
    timestamp: NaiveDateTime,
    world_name: String,
}

const APP_KEY: &str = "com.cosmoartsstore.logback_photoname";
const APP_NAME: &str = "LogBackAndPhotoReName";

#[derive(Serialize)]
struct VRManifestApp {
    app_key: String,
    launch_type: String,
    binary_path_windows: String,
    is_dashboard_overlay: bool,
    strings: std::collections::HashMap<String, VRManifestStrings>,
}

#[derive(Serialize)]
struct VRManifestStrings {
    name: String,
    description: String,
}

#[derive(Serialize)]
struct VRManifest {
    source: String,
    applications: Vec<VRManifestApp>,
}

fn show_error(message: &str) {
    let _ = Command::new("powershell")
        .args(&[
            "-Command",
            &format!(
                "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('{}', 'Error', 'OK', 'Error')",
                message.replace("'", "''")
            ),
        ])
        .spawn();
}

fn get_steamvr_runtime_path() -> Result<PathBuf, String> {
    let home_dir = std::env::var("USERPROFILE").map_err(|_| "Failed to get USERPROFILE")?;
    let vrpath_path = Path::new(&home_dir).join("AppData\\Local\\openvr\\openvrpaths.vrpath");

    if !vrpath_path.exists() {
        return Err("SteamVR configuration (openvrpaths.vrpath) not found.".to_string());
    }

    let file = fs::File::open(vrpath_path).map_err(|e| format!("Failed to open vrpath file: {}", e))?;
    let json: serde_json::Value = serde_json::from_reader(file).map_err(|e| format!("Failed to parse vrpath file: {}", e))?;

    let runtime = json["runtime"]
        .as_array()
        .and_then(|a| a.get(0))
        .and_then(|v| v.as_str())
        .ok_or("SteamVR runtime path not found in configuration.")?;

    Ok(PathBuf::from(runtime))
}

fn install_manifest() -> Result<(), String> {
    let exe_path = std::env::current_exe().map_err(|e| format!("Failed to get current exe path: {}", e))?;
    let exe_dir = exe_path.parent().ok_or("Failed to get exe directory")?;
    let manifest_path = exe_dir.join("manifest.vrmanifest");

    // 1. マニフェストファイルの生成
    let mut strings = std::collections::HashMap::new();
    strings.insert("en_us".to_string(), VRManifestStrings {
        name: APP_NAME.to_string(),
        description: "VRChat Log Backup and Photo Renamer".to_string(),
    });

    let manifest = VRManifest {
        source: "builtin".to_string(),
        applications: vec![VRManifestApp {
            app_key: APP_KEY.to_string(),
            launch_type: "binary".to_string(),
            binary_path_windows: exe_dir.join("LogBackUpTool.exe").to_string_lossy().into_owned(),
            is_dashboard_overlay: true, // スタートアップ（自動起動）に追加させるためにtrueとする
            strings,
        }],
    };

    let manifest_json = serde_json::to_string_pretty(&manifest).map_err(|e| format!("Failed to serialize manifest: {}", e))?;
    let mut file = fs::File::create(&manifest_path).map_err(|e| format!("Failed to create manifest file: {}", e))?;
    file.write_all(manifest_json.as_bytes()).map_err(|e| format!("Failed to write manifest: {}", e))?;

    // 2. vrcmd.exe による登録
    let runtime_path = get_steamvr_runtime_path()?;
    let vrcmd_path = runtime_path.join("bin\\win64\\vrcmd.exe");

    if !vrcmd_path.exists() {
        return Err("vrcmd.exe not found in SteamVR directory.".to_string());
    }

    let output = Command::new(&vrcmd_path)
        .args(&["--appmanifest", manifest_path.to_str().unwrap()])
        .output()
        .map_err(|e| format!("Failed to execute vrcmd: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("vrcmd failed: {}", err));
    }

    Ok(())
}

fn uninstall_manifest() -> Result<(), String> {
    let exe_path = std::env::current_exe().map_err(|e| format!("Failed to get current exe path: {}", e))?;
    let exe_dir = exe_path.parent().ok_or("Failed to get exe directory")?;
    let manifest_path = exe_dir.join("manifest.vrmanifest");

    // 1. マニフェストファイルの削除 (SteamVR側はファイル不在を検知して自動消去/無効化する)
    if manifest_path.exists() {
        let _ = fs::remove_file(manifest_path);
    }

    Ok(())
}

#[tauri::command]
fn preview_renames(photo_dir: String) -> Result<Vec<RenamePreview>, String> {
    let mut world_events = Vec::new();

    // 1. ログのバックアップと読み込み元ディレクトリの準備
    let home_dir = std::env::var("USERPROFILE").map_err(|_| "Failed to get USERPROFILE")?;
    let src_log_dir = Path::new(&home_dir).join("AppData\\LocalLow\\VRChat\\VRChat");
    let prefs = load_preferences();
    let backup_log_dir = prefs.get_effective_target_dir()?;

    // バックアップ先ディレクトリが存在しない場合は作成
    if !backup_log_dir.exists() {
        fs::create_dir_all(&backup_log_dir)
            .map_err(|e| format!("Failed to create backup dir: {}", e))?;
    }

    // ログファイルのバックアップ（コピー処理）
    if src_log_dir.exists() {
        if let Ok(entries) = fs::read_dir(&src_log_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if name.starts_with("output_log_") && name.ends_with(".txt") {
                            let dest_path = backup_log_dir.join(name);
                            // バックアップ先にファイルが存在しない場合のみコピー
                            if !dest_path.exists() {
                                let _ = fs::copy(&path, &dest_path);
                            }
                        }
                    }
                }
            }
        }
    }

    let enter_room_pattern = Regex::new(r"\[Behaviour\] Entering Room: (.+)$").unwrap();
    let timestamp_pattern = Regex::new(r"^(\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2})").unwrap();

    let log_entries = fs::read_dir(&backup_log_dir)
        .map_err(|e| format!("Failed to read backup log dir: {} ({:?})", e, backup_log_dir))?;

    for entry in log_entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with("output_log_") && name.ends_with(".txt") {
                    if let Ok(file) = fs::File::open(&path) {
                        let reader = BufReader::new(file);
                        let mut current_timestamp: Option<NaiveDateTime> = None;

                        for line in reader.lines().flatten() {
                            if let Some(caps) = timestamp_pattern.captures(&line) {
                                if let Ok(ts) = NaiveDateTime::parse_from_str(
                                    caps.get(1).unwrap().as_str(),
                                    "%Y.%m.%d %H:%M:%S",
                                ) {
                                    current_timestamp = Some(ts);
                                }
                            }

                            if let Some(caps) = enter_room_pattern.captures(&line) {
                                let mut world_name =
                                    caps.get(1).unwrap().as_str().trim().to_string();
                                // HTMLタグの簡易除去
                                let tag_pattern = Regex::new(r"<[^>]+>").unwrap();
                                world_name = tag_pattern.replace_all(&world_name, "").to_string();
                                world_name = world_name.trim().to_string();

                                if let Some(ts) = current_timestamp {
                                    world_events.push(WorldEvent {
                                        timestamp: ts,
                                        world_name,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    world_events.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

    if world_events.is_empty() {
        return Ok(Vec::new());
    }

    // 2. 写真の走査
    let mut previews = Vec::new();
    let photo_pattern = Regex::new(r"^(VRChat_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})\.(\d{3}))_(\d+x\d+)\.(png|jpg|jpeg)$").unwrap();

    let photo_entries =
        fs::read_dir(&photo_dir).map_err(|e| format!("Failed to read photo dir: {}", e))?;

    for entry in photo_entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                if let Some(caps) = photo_pattern.captures(file_name) {
                    let prefix = caps.get(1).unwrap().as_str(); // VRChat_YYYY-MM-DD_HH-MM-SS.ms
                    let ds = format!(
                        "{}-{}-{} {}:{}:{}",
                        caps.get(2).unwrap().as_str(),
                        caps.get(3).unwrap().as_str(),
                        caps.get(4).unwrap().as_str(),
                        caps.get(5).unwrap().as_str(),
                        caps.get(6).unwrap().as_str(),
                        caps.get(7).unwrap().as_str()
                    );

                    if let Ok(photo_time) = NaiveDateTime::parse_from_str(&ds, "%Y-%m-%d %H:%M:%S")
                    {
                        // World determination
                        let mut matched_world: Option<String> = None;
                        for event in world_events.iter().rev() {
                            if event.timestamp <= photo_time {
                                matched_world = Some(event.world_name.clone());
                                break;
                            }
                        }

                        if let Some(world) = matched_world {
                            let resolution = caps.get(9).unwrap().as_str();
                            let ext = caps.get(10).unwrap().as_str();

                            let mut sanitized_world = world.clone();
                            let invalid_chars = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
                            for c in invalid_chars.iter() {
                                sanitized_world = sanitized_world.replace(*c, "_");
                            }
                            let multi_underscore = Regex::new(r"_+").unwrap();
                            sanitized_world = multi_underscore
                                .replace_all(&sanitized_world, "_")
                                .to_string();
                            sanitized_world = sanitized_world.trim_matches('_').to_string();

                            let new_name =
                                format!("{}_{}_{}.{}", prefix, sanitized_world, resolution, ext);

                            if file_name != new_name {
                                let new_path = path.with_file_name(&new_name);
                                if !new_path.exists() {
                                    previews.push(RenamePreview {
                                        old_name: file_name.to_string(),
                                        new_name: new_name.clone(),
                                        old_path: path.to_string_lossy().to_string(),
                                        new_path: new_path.to_string_lossy().to_string(),
                                        world_name: world,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(previews)
}

#[tauri::command]
fn preview_rollbacks(photo_dir: String) -> Result<Vec<RenamePreview>, String> {
    let mut previews = Vec::new();
    // 既存のリネーム済みファイルを対象とするパターン:
    // 例: VRChat_2024-01-01_12-00-00.123_WorldName_1920x1080.png
    // キャプチャ1: Prefix (VRChat_日時.ミリ秒)
    // キャプチャ2: WorldName
    // キャプチャ3: 解像度 (1920x1080)
    // キャプチャ4: 拡張子
    let renamed_pattern = Regex::new(r"^(VRChat_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.\d{3})_(.+)_((\d+)x(\d+))\.(png|jpg|jpeg)$").unwrap();

    let photo_entries =
        fs::read_dir(&photo_dir).map_err(|e| format!("Failed to read photo dir: {}", e))?;

    for entry in photo_entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                if let Some(caps) = renamed_pattern.captures(file_name) {
                    let prefix = caps.get(1).unwrap().as_str();
                    let world_name = caps.get(2).unwrap().as_str();
                    let resolution = caps.get(3).unwrap().as_str();
                    let ext = caps.get(6).unwrap().as_str();

                    // 元のファイル名を再構築
                    let original_name = format!("{}_{}.{}", prefix, resolution, ext);

                    let original_path = path.with_file_name(&original_name);
                    
                    if !original_path.exists() {
                        previews.push(RenamePreview {
                            old_name: file_name.to_string(), // 現在の名前（リネーム済）
                            new_name: original_name.clone(), // 戻す名前（オリジナル）
                            old_path: path.to_string_lossy().to_string(),
                            new_path: original_path.to_string_lossy().to_string(),
                            world_name: world_name.to_string(),
                        });
                    }
                }
            }
        }
    }

    Ok(previews)
}

#[tauri::command]
fn execute_renames(items: Vec<RenamePreview>) -> Result<usize, String> {
    let mut count = 0;
    for item in items {
        let old_path = Path::new(&item.old_path);
        let new_path = Path::new(&item.new_path);

        if old_path.exists() && !new_path.exists() {
            if fs::rename(old_path, new_path).is_ok() {
                count += 1;
            }
        }
    }
    Ok(count)
}

#[tauri::command]
fn setup_scheduled_backup() -> Result<String, String> {
    let script_name = "backup_vrc_logs.ps1";
    let current_dir = std::env::current_dir().map_err(|e| format!("Get current dir failed: {}", e))?;
    
    // We assume the script is located in the scripts folder relative to project root or current dir
    // Since we're running dev server, we can look up two directories from src-tauri
    let script_path = current_dir.parent().unwrap().join("scripts").join(script_name);
    
    if !script_path.exists() {
        return Err(format!("Backup script not found at: {:?}", script_path));
    }

    let task_name = "VRChatLogBackup_RenameSys";
    let script_path_str = script_path.to_str().unwrap();

    let ps_command = format!(
        "$Action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-ExecutionPolicy Bypass -WindowStyle Hidden -File \"{}\"'; \
        $Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 3); \
        $Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -DontStopOnIdleEnd; \
        Register-ScheduledTask -TaskName '{}' -Action $Action -Trigger $Trigger -Settings $Settings -Force",
        script_path_str, task_name
    );

    let output = std::process::Command::new("powershell")
        .args(&["-Command", &ps_command])
        .output()
        .map_err(|e| format!("Failed to execute powershell: {}", e))?;

    if output.status.success() {
        Ok("スケジュールバックアップの登録に成功しました（3時間おき）".to_string())
    } else {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        Err(format!("スケジューラ登録失敗: {}", err_msg))
    }
}

#[cfg(feature = "resident")]
fn backup_logs_impl() -> Result<(), String> {
    let home_dir = std::env::var("USERPROFILE").map_err(|_| "Failed to get USERPROFILE")?;
    let src_log_dir = Path::new(&home_dir).join("AppData\\LocalLow\\VRChat\\VRChat");
    let prefs = load_preferences();
    let backup_log_dir = prefs.get_effective_target_dir()?;

    if !backup_log_dir.exists() {
        fs::create_dir_all(&backup_log_dir)
            .map_err(|e| format!("Failed to create backup dir: {}", e))?;
    }

    if src_log_dir.exists() {
        if let Ok(entries) = fs::read_dir(&src_log_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if name.starts_with("output_log_") && name.ends_with(".txt") {
                            let dest_path = backup_log_dir.join(name);
                            if !dest_path.exists() {
                                let _ = fs::copy(&path, &dest_path);
                            } else {
                                if let (Ok(src_meta), Ok(dest_meta)) = (fs::metadata(&path), fs::metadata(&dest_path)) {
                                    if let (Ok(src_time), Ok(dest_time)) = (src_meta.modified(), dest_meta.modified()) {
                                        if src_time > dest_time {
                                            let _ = fs::copy(&path, &dest_path);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn get_preferences_cmd() -> Preferences {
    let mut prefs = load_preferences();
    if prefs.target_dir.is_empty() {
        if let Ok(effective_dir) = prefs.get_effective_target_dir() {
            prefs.target_dir = effective_dir.to_string_lossy().into_owned();
        }
    }
    prefs
}

#[tauri::command]
fn save_preferences_cmd(prefs: Preferences) -> Result<(), String> {
    save_preferences(&prefs)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 {
        match args[1].as_str() {
            "-install-manifest" => {
                if let Err(e) = install_manifest() {
                    show_error(&format!("SteamVRへの登録に失敗しました:\n{}", e));
                    std::process::exit(1);
                }
                std::process::exit(0);
            }
            "-uninstall-manifest" => {
                let _ = uninstall_manifest();
                std::process::exit(0);
            }
            _ => {}
        }
    }

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            preview_renames, 
            execute_renames, 
            preview_rollbacks,
            setup_scheduled_backup,
            get_preferences_cmd,
            save_preferences_cmd
        ]);

    #[cfg(feature = "resident")]
    {
        use tauri::Manager;
        use tauri_plugin_tray_icon::{TrayIconBuilder, menu::{MenuBuilder, MenuItemBuilder}};
        use std::time::Duration;

        builder = builder
            .plugin(tauri_plugin_tray_icon::init())
            .setup(|app| {
                // ウィンドウを非表示で開始 (必要に応じて)
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }

                let toggle_i = MenuItemBuilder::with_id("toggle", "Open Window").build(app)?;
                let backup_i = MenuItemBuilder::with_id("backup", "Backup Now").build(app)?;
                let quit_i = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
                
                let menu = MenuBuilder::new(app)
                    .items(&[&toggle_i, &backup_i, &quit_i])
                    .build()?;

                let _tray = TrayIconBuilder::new()
                    .menu(&menu)
                    .icon(app.default_window_icon().unwrap().clone())
                    .tooltip("VRC Photo Renamer")
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "toggle" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "backup" => {
                            let _ = backup_logs_impl();
                        }
                        "quit" => {
                            std::process::exit(0);
                        }
                        _ => {}
                    })
                    .build(app)?;

                // バックグラウンドループ (3時間ごと)
                std::thread::spawn(|| {
                    loop {
                        let _ = backup_logs_impl();
                        std::thread::sleep(Duration::from_secs(60 * 60 * 3));
                    }
                });

                Ok(())
            });
    }

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
