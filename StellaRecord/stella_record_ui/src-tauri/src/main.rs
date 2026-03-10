#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod planetarium;

use std::process::Command;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use sysinfo::{System, ProcessesToUpdate};
use stella_record_ui::config::{
    load_polaris_setting, load_stellarecord_setting,
};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use tauri::Emitter;
use std::path::PathBuf;

// ﾂｧ5: STELLA_RECORD.exe 窶・Polaris險ｭ螳壹・Planetarium險ｭ螳壹・謇句虚繝舌ャ繧ｯ繧｢繝・・


/// 繝ｭ繧ｰ縺ｮ zst 繧ｵ繝悶ヵ繧ｩ繝ｫ繝蜀・・ .tar.zst 繝輔ぃ繧､繝ｫ荳隕ｧ繧貞叙蠕暦ｼ域律莉倬剄鬆・ｼ・#[tauri::command]
fn list_archive_files() -> Result<Vec<String>, String> {
    let setting = load_polaris_setting();
    let archive_dir = setting.get_effective_archive_dir()?;
    let zst_dir = archive_dir.join("zst");
    let mut files = Vec::new();

    if zst_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&zst_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                        if name.ends_with(".tar.zst") {
                            files.push(name.to_string());
                        }
                    }
                }
            }
        }
    }
    // 繝輔ぃ繧､繝ｫ蜷阪↓縺ｯ繧ｿ繧､繝繧ｹ繧ｿ繝ｳ繝励′蜷ｫ縺ｾ繧後ｋ縺ｮ縺ｧ髯埼・た繝ｼ繝医〒譌･莉俶眠縺励＞鬆・↓縺ｪ繧・    files.sort();
    files.reverse();
    Ok(files)
}

/// 驕主悉繝ｭ繧ｰ繧貞悸邵ｮ (繝ｬ繝吶Ν3)縲ょｮ御ｺ・ｾ後↓蜈・ヵ繧｡繧､繝ｫ繧貞炎髯､縺・zst/ 繧ｵ繝悶ヵ繧ｩ繝ｫ繝縺ｸ譬ｼ邏阪・#[tauri::command]
fn compress_logs() -> Result<String, String> {
    let setting = load_polaris_setting();
    let archive_dir = setting.get_effective_archive_dir()?;
    if !archive_dir.exists() {
        return Err("繧｢繝ｼ繧ｫ繧､繝悶ョ繧｣繝ｬ繧ｯ繝医Μ縺悟ｭ伜惠縺励∪縺帙ｓ縲・.to_string());
    }

    // zst 繧ｵ繝悶ヵ繧ｩ繝ｫ繝繧剃ｽ懈・
    let zst_dir = archive_dir.join("zst");
    std::fs::create_dir_all(&zst_dir).map_err(|e| e.to_string())?;

    let mut count = 0;
    let entries = std::fs::read_dir(&archive_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with("output_log_") && name.ends_with(".txt") {
                    // 菫晏ｭ伜・: zst/output_log_xxxx.txt.tar.zst
                    let zst_name = format!("{}.tar.zst", name);
                    let zst_path = zst_dir.join(&zst_name);
                    if !zst_path.exists() {
                        // 蝨ｧ邵ｮ謌仙粥蠕後・縺ｿ蜈・ヵ繧｡繧､繝ｫ繧貞炎髯､
                        compress_single_file(&path, &zst_path)?;
                        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
                        count += 1;
                    }
                }
            }
        }
    }

    Ok(format!("螳御ｺ・＠縺ｾ縺励◆縲・}蛟九・繝輔ぃ繧､繝ｫ繧貞悸邵ｮ繝ｻ遘ｻ蜍輔＠縺ｾ縺励◆縲・, count))
}

fn compress_single_file(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    let file = std::fs::File::create(dst).map_err(|e| e.to_string())?;
    let enc = zstd::stream::Encoder::new(file, 3).map_err(|e| e.to_string())?.auto_finish();
    let mut tar = tar::Builder::new(enc);
    
    let file_name = src.file_name().ok_or("Invalid file name")?;
    let mut f = std::fs::File::open(src).map_err(|e| e.to_string())?;
    tar.append_file(file_name, &mut f).map_err(|e| e.to_string())?;
    
    tar.finish().map_err(|e| e.to_string())?;
    Ok(())
}

/// 蠑ｷ蛹門酔譛滂ｼ夊､・焚繝輔ぃ繧､繝ｫ繧偵∪縺ｨ繧√※繧､繝ｳ繝昴・繝・#[tauri::command]
fn launch_enhanced_import(handle: tauri::AppHandle, file_names: Vec<String>) -> Result<String, String> {
    let setting = load_stellarecord_setting();
    let db_path = setting.get_effective_db_path()?;
    let archive_dir = setting.get_effective_archive_dir()?;
    let zst_dir = archive_dir.join("zst");

    // 繝輔ぃ繧､繝ｫ縺悟・縺ｦ蟄伜惠縺吶ｋ縺倶ｺ句燕遒ｺ隱・    let mut target_paths = Vec::new();
    for name in &file_names {
        let path = zst_dir.join(name);
        if !path.exists() {
            return Err(format!("繝輔ぃ繧､繝ｫ縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ: {}", name));
        }
        target_paths.push(path);
    }
    let total = target_paths.len();

    std::thread::spawn(move || {
        for (idx, target_path) in target_paths.into_iter().enumerate() {
            let file_label = target_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            let _ = handle.emit("planetarium-progress", PlanetariumPayload {
                status: format!("[{}/{}] {}", idx + 1, total, file_label),
                progress: format!("{}%", (idx * 100) / total.max(1)),
                is_running: true,
            });

            let result = planetarium::run_enhanced_import(
                db_path.clone(),
                target_path,
                |status, progress| {
                    let _ = handle.emit("planetarium-progress", PlanetariumPayload {
                        status,
                        progress,
                        is_running: true,
                    });
                },
            );

            if let Err(e) = result {
                let _ = handle.emit("planetarium-progress", PlanetariumPayload {
                    status: format!("繧ｨ繝ｩ繝ｼ: {}", e),
                    progress: "0%".to_string(),
                    is_running: false,
                });
                let _ = handle.emit("planetarium-finished", ());
                return;
            }
        }

        let _ = handle.emit("planetarium-progress", PlanetariumPayload {
            status: format!("{}莉ｶ縺ｮ繧､繝ｳ繝昴・繝医′螳御ｺ・＠縺ｾ縺励◆縲・, total),
            progress: "100%".to_string(),
            is_running: false,
        });
        let _ = handle.emit("planetarium-finished", ());
    });

    Ok(format!("{}莉ｶ縺ｮ繧｢繝ｼ繧ｫ繧､繝悶・蜷梧悄繧帝幕蟋九＠縺ｾ縺励◆縲・, total))
}

/// zst/ 蜀・・ .tar.zst 繧・archive 繝輔か繝ｫ繝縺ｸ螻暮幕縺励・txt 縺ｮ蟄伜惠繧堤｢ｺ隱榊ｾ後↓ .tar.zst 繧貞炎髯､
#[tauri::command]
fn decompress_logs(file_names: Vec<String>) -> Result<String, String> {
    let setting = load_polaris_setting();
    let archive_dir = setting.get_effective_archive_dir()?;
    let zst_dir = archive_dir.join("zst");

    if !zst_dir.exists() {
        return Err("zst 繝輔か繝ｫ繝縺悟ｭ伜惠縺励∪縺帙ｓ縲・.to_string());
    }

    let mut success_count = 0;
    let mut skip_count = 0;

    for name in &file_names {
        let zst_path = zst_dir.join(name);
        if !zst_path.exists() {
            return Err(format!("繝輔ぃ繧､繝ｫ縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ: {}", name));
        }

        // 螻暮幕蜈医・ .txt 蜷阪ｒ遘ｺ螳・(output_log_xxxx.txt.tar.zst -> output_log_xxxx.txt)
        let txt_name = name.replace(".tar.zst", "");
        let txt_path = archive_dir.join(&txt_name);

        // 螻暮幕蜈医↓縺吶〒縺ｫ .txt 縺後≠繧後・繧ｹ繧ｭ繝・・
        if txt_path.exists() {
            skip_count += 1;
            continue;
        }

        // zstd 繧ｹ繝医Μ繝ｼ繝 -> tar 繧｢繝ｼ繧ｫ繧､繝・-> archive_dir 縺ｸ隕∝ｱ暮幕
        let file = std::fs::File::open(&zst_path).map_err(|e| e.to_string())?;
        let decoder = zstd::stream::Decoder::new(file).map_err(|e| e.to_string())?;
        let mut archive = tar::Archive::new(decoder);
        archive.unpack(&archive_dir).map_err(|e| e.to_string())?;

        // .txt 縺悟ｱ暮幕縺輔ｌ縺溘°遒ｺ隱・        if !txt_path.exists() {
            return Err(format!("螻暮幕縺ｫ螟ｱ謨励＠縺ｾ縺励◆: {}", txt_name));
        }

        // .txt 縺ｮ蟄伜惠繧堤｢ｺ隱阪＠縺溘≧縺医〒 .tar.zst 繧貞炎髯､
        std::fs::remove_file(&zst_path).map_err(|e| e.to_string())?;
        success_count += 1;
    }

    if skip_count > 0 {
        Ok(format!("{}蛟九ｒ螻暮幕縺励∪縺励◆縲・}蛟九・譌｢縺ｫ螻暮幕貂医∩縺ｧ繧ｹ繧ｭ繝・・縺励∪縺励◆縲・, success_count, skip_count))
    } else {
        Ok(format!("{}蛟九・繧｢繝ｼ繧ｫ繧､繝悶ｒ螻暮幕縺励∝・繝輔ぃ繧､繝ｫ繧貞炎髯､縺励∪縺励◆縲・, success_count))
    }
}

/// ﾂｧ5.2 襍ｷ蜍輔す繝ｼ繧ｱ繝ｳ繧ｹ / ﾂｧ5.5 Planetarium謇句虚譛譁ｰ蛹悶・蠑ｷ蛻ｶSync
#[tauri::command]
fn launch_external_app(app_path: &str) -> Result<(), String> {
    let mut cmd = Command::new(app_path);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    cmd.spawn()
        .map_err(|e| format!("襍ｷ蜍輔↓螟ｱ謨励＠縺ｾ縺励◆: {}", e))?;
    Ok(())
}

#[tauri::command]
fn get_polaris_status() -> bool {
    let mut sys = System::new_all();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    sys.processes().values().any(|p| {
        let n = p.name().to_string_lossy().to_lowercase();
        n == "polaris.exe" || n == "polaris"
    })
}

#[tauri::command]
fn open_folder(path: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        Command::new("explorer")
            .arg(path)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        Err("Unsupported platform".to_string())
    }
}

#[tauri::command]
fn get_polaris_logs() -> Result<Vec<String>, String> {
    let local = std::env::var("LOCALAPPDATA").map_err(|_| "LOCALAPPDATA not found")?;
    let log_path = std::path::Path::new(&local).join("CosmoArtsStore\\STELLARECORD\\Polaris\\polaris_appinfo.log");
    
    if !log_path.exists() {
        return Ok(vec!["繝ｭ繧ｰ繝輔ぃ繧､繝ｫ縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ縲・.to_string()]);
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        use windows::Win32::Storage::FileSystem::FILE_SHARE_READ;
        let file = fs::OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ.0)
            .open(log_path).map_err(|e| e.to_string())?;
        let reader = BufReader::new(file);
        let mut lines: Vec<String> = reader.lines().filter_map(|l| l.ok()).collect();
        if lines.len() > 100 {
            lines = lines.split_off(lines.len() - 100);
        }
        Ok(lines)
    }
    #[cfg(not(windows))]
    {
        let file = fs::File::open(log_path).map_err(|e| e.to_string())?;
        let reader = BufReader::new(file);
        let mut lines: Vec<String> = reader.lines().filter_map(|l| l.ok()).collect();
        if lines.len() > 100 {
            lines = lines.split_off(lines.len() - 100);
        }
        Ok(lines)
    }
}

#[derive(Clone, serde::Serialize)]
struct PlanetariumPayload {
    status: String,
    progress: String,
    is_running: bool,
}

#[tauri::command]
fn launch_planetarium(handle: tauri::AppHandle, _mode: String) -> Result<String, String> {
    let setting = load_stellarecord_setting();
    let db_path = setting.get_effective_db_path()?;
    let archive_dir = setting.get_effective_archive_dir()?;
    
    std::thread::spawn(move || {
        let result = planetarium::run_diff_import(db_path, archive_dir, |status, progress| {
            let _ = handle.emit("planetarium-progress", PlanetariumPayload {
                status: status.clone(),
                progress: progress.clone(),
                is_running: true,
            });
        });
        
        match result {
            Ok(_) => {
                let _ = handle.emit("planetarium-progress", PlanetariumPayload {
                    status: "螳御ｺ・.to_string(),
                    progress: "100%".to_string(),
                    is_running: false,
                });
            }
            Err(e) => {
                let _ = handle.emit("planetarium-progress", PlanetariumPayload {
                    status: format!("繧ｨ繝ｩ繝ｼ: {}", e),
                    progress: "0%".to_string(),
                    is_running: false,
                });
            }
        }
        let _ = handle.emit("planetarium-finished", ());
    });
    
    Ok("Planetarium 繧帝幕蟋九＠縺ｾ縺励◆縲・.to_string())
}

#[tauri::command]
fn get_storage_status() -> Result<(u64, u64), String> {
    let setting = load_polaris_setting();
    let archive_dir = setting.get_effective_archive_dir()?;
    
    let mut total_size = 0;
    if archive_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&archive_dir) {
            for entry in entries.flatten() {
                if let Ok(meta) = entry.metadata() {
                    if meta.is_file() {
                        total_size += meta.len();
                    }
                }
            }
        }
    }
    
    Ok((total_size, setting.capacityThresholdBytes))
}

/// ﾂｧ308/ﾂｧ6.3 StellaRecord繧､繝ｳ繝昴・繝亥・逅・・荳ｭ譁ｭ・医せ繝ｬ繝・ラ繝吶・繧ｹ縺ｮ縺溘ａ蛛懈ｭ｢騾夂衍縺ｮ縺ｿ・・#[tauri::command]
fn cancel_planetarium() -> Result<(), String> {
    // 繧､繝ｳ繝昴・繝亥・逅・・Rust繧ｹ繝ｬ繝・ラ蜀・〒螳溯｡後＆繧後ｋ縺溘ａ縲∝､夜Κ繝励Ο繧ｻ繧ｹ縺ｮkill縺ｯ荳崎ｦ√・    // 蟆・擂逧・↓縺ｯAtomicBool遲峨〒繧ｭ繝｣繝ｳ繧ｻ繝ｫ繝輔Λ繧ｰ繧堤ｫ九※繧句ｮ溯｣・↓螟画峩縺吶ｋ縺薙→縲・    Ok(())
}

#[derive(Debug, serde::Serialize)]
pub struct TableData {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
}

#[tauri::command]
fn get_db_tables() -> Result<Vec<String>, String> {
    let setting = load_stellarecord_setting();
    let db_path = setting.get_effective_db_path()?;

    if !db_path.exists() { return Ok(vec![]); }

    let conn = rusqlite::Connection::open(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .map_err(|e| e.to_string())?;
    
    let rows = stmt.query_map([], |row| row.get(0)).map_err(|e| e.to_string())?;
    let mut results = Vec::new();
    for row in rows {
        if let Ok(v) = row {
            results.push(v);
        }
    }
    Ok(results)
}

#[tauri::command]
fn get_db_table_data(table_name: &str) -> Result<TableData, String> {
    let setting = load_stellarecord_setting();
    let db_path = setting.get_effective_db_path()?;

    if !db_path.exists() { return Err("Database file not found".to_string()); }

    let conn = rusqlite::Connection::open(db_path).map_err(|e| e.to_string())?;
    
    // SQL繧ｹ繝・・繝医Γ繝ｳ繝医・繝舌Μ繝・・繧ｷ繝ｧ繝ｳ (繝・・繝悶Ν蜷阪′闍ｱ謨ｰ蟄・荳狗ｷ壹・縺ｿ縺九メ繧ｧ繝・け)
    if !table_name.chars().all(|c| c.is_alphanumeric() || c == '_') {
        return Err("Invalid table name".to_string());
    }

    let sql = format!("SELECT * FROM {} ORDER BY id DESC LIMIT 100", table_name);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    
    let column_count = stmt.column_count();
    let columns: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

    let mut rows = stmt.query([]) .map_err(|e| e.to_string())?;
    let mut results = Vec::new();

    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut string_row = Vec::new();
        for i in 0..column_count {
            let value: rusqlite::types::Value = row.get(i).map_err(|e| e.to_string())?;
            string_row.push(match value {
                rusqlite::types::Value::Null => "NULL".to_string(),
                rusqlite::types::Value::Integer(i) => i.to_string(),
                rusqlite::types::Value::Real(f) => f.to_string(),
                rusqlite::types::Value::Text(t) => t,
                rusqlite::types::Value::Blob(_) => "<BLOB>".to_string(),
            });
        }
        results.push(string_row);
    }

    Ok(TableData {
        columns,
        rows: results,
    })
}

#[tauri::command]
fn delete_today_data() -> Result<String, String> {
    let setting = load_stellarecord_setting();
    let db_path = setting.get_effective_db_path()?;

    if !db_path.exists() { return Err("Database file not found".to_string()); }

    let conn = rusqlite::Connection::open(db_path).map_err(|e| e.to_string())?;
    
    // 莉頑律・・ST繧呈Φ螳壹＠縺､縺､邏譛ｴ縺ｫDATETIME豈碑ｼ・ｼ峨・繝・・繧ｿ繧貞炎髯､
    let affected = conn.execute(
        "DELETE FROM world_visits WHERE date(join_time) = date('now', 'localtime')",
        []
    ).map_err(|e| e.to_string())?;

    Ok(format!("莉頑律蛻・・繝・・繧ｿ {} 莉ｶ繧貞炎髯､縺励∪縺励◆縲・, affected))
}

#[tauri::command]
fn wipe_database() -> Result<String, String> {
    let setting = load_stellarecord_setting();
    let db_path = setting.get_effective_db_path()?;

    if !db_path.exists() { return Err("繝・・繧ｿ繝吶・繧ｹ繝輔ぃ繧､繝ｫ縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ縲・.to_string()); }

    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;

    // 螟夜Κ繧ｭ繝ｼ鬆・↓蠕薙＞縲∝ｭ舌ユ繝ｼ繝悶Ν縺九ｉ蜑企勁・・layer_visits 繧貞ｿ倥ｌ繧九→蜑企勁縺御ｸ榊ｮ悟・縺ｫ縺ｪ繧具ｼ・    conn.execute("DELETE FROM player_visits", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM avatar_changes", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM video_playbacks", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM world_visits", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM players", []).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM app_sessions", []).map_err(|e| e.to_string())?;

    // SQLite縺ｮ繝舌く繝･繝ｼ繝繧貞ｮ溯｡後＠縺ｦ繝輔ぃ繧､繝ｫ繧ｵ繧､繧ｺ繧貞炎貂・    let _ = conn.execute("VACUUM", []);

    Ok("繝・・繧ｿ繝吶・繧ｹ繧貞ｮ悟・縺ｫ蛻晄悄蛹悶＠縺ｾ縺励◆縲・.to_string())
}

#[tauri::command]
fn read_launcher_json(section: &str) -> Vec<stella_record_ui::config::AppCard> {
    let filename = if section == "pleiades" { "pleiades.json" } else { "jewelbox.json" };
    stella_record_ui::config::load_launcher_json(filename)
}

#[tauri::command]
async fn start_polaris() -> Result<String, String> {
    let mut sys = System::new_all();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    let is_running = sys.processes().values().any(|p| {
        let n = p.name().to_string_lossy().to_lowercase();
        n == "polaris.exe" || n == "polaris"
    });
    
    if is_running {
        return Ok("Polaris 縺ｯ譌｢縺ｫ襍ｷ蜍輔＠縺ｦ縺・∪縺吶・.to_string());
    }

    let polaris_exe = {
        let local = std::env::var("LOCALAPPDATA").map_err(|_| "LOCALAPPDATA not found".to_string())?;
        std::path::Path::new(&local).join("CosmoArtsStore\\STELLARECORD\\Polaris\\polaris.exe")
    };

    if !polaris_exe.exists() {
        return Err("Polaris.exe 縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ縲・.to_string());
    }

    let mut cmd = Command::new(polaris_exe);
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok("Polaris 繧定ｵｷ蜍輔＠縺ｾ縺励◆縲・.to_string())
}

fn main() {
    // #19: Panic Hook縺ｮ險ｭ螳・窶・繝ｪ繝ｪ繝ｼ繧ｹ繝薙Ν繝峨〒縺ｮ繧ｵ繧､繝ｬ繝ｳ繝医け繝ｩ繝・す繝･繧帝亟豁｢
    std::panic::set_hook(Box::new(|info| {
        let location = info.location()
            .map(|l| format!("at {}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "unknown location".to_string());
        let payload = info.payload();
        let msg = if let Some(s) = payload.downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = payload.downcast_ref::<String>() {
            s.clone()
        } else {
            "No error message".to_string()
        };
        // 繝ｭ繧ｰ縺ｫ繧ｯ繝ｩ繝・す繝･諠・ｱ繧呈嶌縺榊・縺・        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            let log_path = std::path::Path::new(&local)
                .join("CosmoArtsStore").join("stellarecord").join("crash.log");
            if let Some(parent) = log_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
            if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log_path) {
                let _ = std::io::Write::write_fmt(&mut f, format_args!("[{}] [PANIC] {} {}\n", now, msg, location));
            }
        }
        eprintln!("[PANIC] {} {}", msg, location);
    }));

    // #4: 二重起動防止 (DBへの書き込みが発生するため必須)
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::{ERROR_ALREADY_EXISTS, GetLastError};
        use windows::Win32::System::Threading::CreateMutexW;
        use windows::core::PCWSTR;
        let mutex_name: Vec<u16> = "Global\\StellaRecord_SingleInstance\0".encode_utf16().collect();
        let _ = unsafe { CreateMutexW(None, true, PCWSTR(mutex_name.as_ptr())) };
        if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
            eprintln!("StellaRecord is already running.");
            std::process::exit(0);
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_archive_files,
            compress_logs,
            decompress_logs,
            launch_enhanced_import,
            launch_planetarium,
            cancel_planetarium,
            read_launcher_json,
            launch_external_app,
            get_polaris_logs,
            start_polaris,
            get_storage_status,
            get_db_tables,
            get_db_table_data,
            delete_today_data,
            wipe_database,
            open_folder,
        ])
        .setup(|app| {
            // Polaris 蟶ｸ鬧千屮隕悶せ繝ｬ繝・ラ (3遘偵♀縺阪↓ emit)
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let mut sys = System::new_all();
                loop {
                    sys.refresh_processes(ProcessesToUpdate::All, true);
                    let is_running = sys.processes().values().any(|p| {
                        let n = p.name().to_string_lossy().to_lowercase();
                        n == "polaris.exe" || n == "polaris"
                    });
                    let _ = handle.emit("polaris-status", is_running);
                    std::thread::sleep(std::time::Duration::from_secs(3));
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
