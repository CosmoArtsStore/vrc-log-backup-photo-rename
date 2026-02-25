// Stargazer: 完全ローカル用 Tauri コマンド（LocalAppData / ファイル操作のみ）

// --- LocalAppData/CosmoArtsStore/Stargazer: src, backup/lottery, backup/matching, cast ---
fn base_dir() -> Result<std::path::PathBuf, String> {
    let local = std::env::var("LOCALAPPDATA").map_err(|_| "LOCALAPPDATA が取得できません".to_string())?;
    Ok(std::path::PathBuf::from(local).join("CosmoArtsStore").join("Stargazer"))
}

fn stargazer_dir() -> Result<std::path::PathBuf, String> {
    let base = base_dir()?;
    let event_path_file = base.join("eventPath");
    
    // If eventPath exists, read the relative path (e.g., project/eventA)
    if event_path_file.exists() {
        if let Ok(content) = std::fs::read_to_string(&event_path_file) {
            let trimmed = content.trim();
            if !trimmed.is_empty() {
                // Return base/trimmed
                return Ok(base.join(trimmed));
            }
        }
    }
    // Fallback to base
    Ok(base)
}

#[tauri::command]
fn get_current_event() -> Result<Option<String>, String> {
    let base = base_dir()?;
    let event_path_file = base.join("eventPath");
    if event_path_file.exists() {
        if let Ok(content) = std::fs::read_to_string(&event_path_file) {
            let trimmed = content.trim();
            if !trimmed.is_empty() {
                // project/eventName -> eventName
                let parts: Vec<&str> = trimmed.split('/').collect();
                if let Some(last) = parts.last() {
                    return Ok(Some(last.to_string()));
                }
                return Ok(Some(trimmed.to_string()));
            }
        }
    }
    Ok(None)
}

#[tauri::command]
fn set_current_event(event_name: String) -> Result<(), String> {
    let base = base_dir()?;
    if !base.exists() {
        std::fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    }
    let event_path_file = base.join("eventPath");
    let target = format!("project/{}", event_name);
    std::fs::write(&event_path_file, target).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn list_events() -> Result<Vec<String>, String> {
    let base = base_dir()?;
    let project_dir = base.join("project");
    let mut events = Vec::new();

    if project_dir.exists() && project_dir.is_dir() {
        let read_dir = std::fs::read_dir(&project_dir).map_err(|e| format!("read_dir 失敗 {}: {}", project_dir.display(), e))?;
        for item in read_dir {
            if let Ok(entry) = item {
                if let Ok(meta) = entry.metadata() {
                    if meta.is_dir() {
                        events.push(entry.file_name().to_string_lossy().to_string());
                    }
                }
            }
        }
    }
    Ok(events)
}

#[tauri::command]
fn create_event(event_name: String) -> Result<(), String> {
    let base = base_dir()?;
    let target_dir = base.join("project").join(&event_name);
    // Create base application directories inside this new event directory
    std::fs::create_dir_all(target_dir.join("src")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(target_dir.join("backup").join("lottery")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(target_dir.join("backup").join("matching")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(target_dir.join("template").join("temp")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(target_dir.join("template").join("pref")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(target_dir.join("pref")).map_err(|e| e.to_string())?;
    let cast_dir = target_dir.join("cast");
    std::fs::create_dir_all(&cast_dir).map_err(|e| e.to_string())?;
    let cast_json = cast_dir.join("cast.json");
    if !cast_json.exists() {
        std::fs::write(&cast_json, r#"{"casts":[]}"#).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_app_data_dir() -> Result<String, String> {
    let path = stargazer_dir()?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn ensure_app_dirs() -> Result<(), String> {
    let base = stargazer_dir()?;
    std::fs::create_dir_all(base.join("src")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(base.join("backup").join("lottery")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(base.join("backup").join("matching")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(base.join("template").join("temp")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(base.join("template").join("pref")).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(base.join("pref")).map_err(|e| e.to_string())?;
    let cast_dir = base.join("cast");
    std::fs::create_dir_all(&cast_dir).map_err(|e| e.to_string())?;
    let cast_json = cast_dir.join("cast.json");
    if !cast_json.exists() {
        std::fs::write(&cast_json, r#"{"casts":[]}"#).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn check_app_dirs_exist() -> Result<bool, String> {
    let base = stargazer_dir()?;
    if !base.exists() {
        return Ok(false);
    }
    for sub in ["src", "backup/lottery", "backup/matching", "cast", "template/temp", "template/pref", "pref"] {
        let dir = base.join(sub);
        if !dir.exists() {
            return Ok(false);
        }
    }
    Ok(true)
}

// --- JSON ローカルDB（キャスト・NG） ---
fn cast_db_path() -> Result<std::path::PathBuf, String> {
    let base = stargazer_dir()?;
    Ok(base.join("cast").join("cast.json"))
}

#[tauri::command]
fn read_cast_db_json() -> Result<String, String> {
    let path = cast_db_path()?;
    if path.exists() {
        std::fs::read_to_string(&path).map_err(|e| format!("cast.json 読み込み失敗: {}", e))
    } else {
        Ok(r#"{"casts":[]}"#.to_string())
    }
}

#[tauri::command]
fn write_cast_db_json(content: String) -> Result<(), String> {
    let path = cast_db_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, content).map_err(|e| format!("cast.json 保存失敗: {}", e))
}

// --- デバッグ: LocalAppData 内フォルダ構造 ---
#[derive(serde::Serialize)]
struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<DirEntry>>,
}

fn list_dir_recursive(path: &std::path::Path, base: &std::path::Path) -> Result<Vec<DirEntry>, String> {
    let mut entries = Vec::new();
    let read_dir = std::fs::read_dir(path).map_err(|e| format!("read_dir 失敗 {}: {}", path.display(), e))?;
    for item in read_dir {
        let entry = item.map_err(|e| e.to_string())?;
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        let full = entry.path();
        let rel_path = full.strip_prefix(base).unwrap_or(&full);
        let path_str = rel_path.to_string_lossy().to_string();
        let is_dir = meta.is_dir();
        let children = if is_dir {
            Some(list_dir_recursive(&full, base).unwrap_or_default())
        } else {
            None
        };
        entries.push(DirEntry {
            name,
            path: path_str,
            is_dir,
            children,
        });
    }
    entries.sort_by(|a, b| {
        let a_is_dir = a.is_dir;
        let b_is_dir = b.is_dir;
        match (a_is_dir, b_is_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });
    Ok(entries)
}

#[tauri::command]
fn list_app_data_structure() -> Result<DirEntry, String> {
    let base = stargazer_dir()?;
    let name = base.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "Stargazer".to_string());
    let path_str = base.to_string_lossy().to_string();
    if !base.exists() {
        return Ok(DirEntry {
            name,
            path: path_str,
            is_dir: true,
            children: Some(vec![]),
        });
    }
    let children = list_dir_recursive(&base, &base)?;
    Ok(DirEntry {
        name,
        path: path_str,
        is_dir: true,
        children: Some(children),
    })
}

/// 抽選結果を backup/lottery/lottery_YYYYMMDD_HHMMSS.tsv に保存（UTF-8 BOMなし）
#[tauri::command]
fn write_backup_lottery_tsv(content: String) -> Result<String, String> {
    let base = stargazer_dir()?;
    std::fs::create_dir_all(base.join("backup").join("lottery")).map_err(|e| e.to_string())?;
    let now = chrono::Local::now();
    let name = format!("lottery_{}.tsv", now.format("%Y%m%d_%H%M%S"));
    let path = base.join("backup").join("lottery").join(&name);
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// マッチング結果を backup/matching/matching_YYYYMMDD_HHMMSS.tsv に保存（UTF-8 BOMなし）
#[tauri::command]
fn write_backup_matching_tsv(content: String) -> Result<String, String> {
    let base = stargazer_dir()?;
    std::fs::create_dir_all(base.join("backup").join("matching")).map_err(|e| e.to_string())?;
    let now = chrono::Local::now();
    let name = format!("matching_{}.tsv", now.format("%Y%m%d_%H%M%S"));
    let path = base.join("backup").join("matching").join(&name);
    std::fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// ユーザーが選択したファイル（CSV 等）の内容を読み込む
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err("ファイルが見つかりません".to_string());
    }
    std::fs::read_to_string(p).map_err(|e| format!("ファイル読み込み失敗: {}", e))
}

/// インポート用: ヘッダーテンプレートと設定を template/temp と template/pref に保存（日時秒付き）
#[tauri::command]
fn save_import_template(header_json: String, pref_json: String) -> Result<String, String> {
    let base = stargazer_dir()?;
    let temp_dir = base.join("template").join("temp");
    let pref_dir = base.join("template").join("pref");
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&pref_dir).map_err(|e| e.to_string())?;
    let now = chrono::Local::now();
    let ts = now.format("%Y%m%d_%H%M%S").to_string();
    let temp_name = format!("template_{}.json", ts);
    let pref_name = format!("pref_{}.json", ts);
    std::fs::write(temp_dir.join(&temp_name), &header_json).map_err(|e| e.to_string())?;
    std::fs::write(pref_dir.join(&pref_name), &pref_json).map_err(|e| e.to_string())?;
    Ok(ts)
}

/// インポート用: 現在のヘッダーと一致するテンプレートを temp から検索し、対応する pref を返す（新しい順）
#[tauri::command]
fn get_matching_import_pref(header_json: String) -> Result<Option<String>, String> {
    let base = stargazer_dir()?;
    let temp_dir = base.join("template").join("temp");
    let pref_dir = base.join("template").join("pref");
    if !temp_dir.exists() {
        return Ok(None);
    }
    let current: Vec<String> = serde_json::from_str(&header_json).map_err(|e| e.to_string())?;
    let current_norm: Vec<String> = current.iter().map(|s| s.trim().to_string()).collect();
    let mut entries: Vec<_> = std::fs::read_dir(&temp_dir).map_err(|e| e.to_string())?.collect();
    entries.sort_by(|a, b| {
        let a = a.as_ref().ok().and_then(|e| e.file_name().into_string().ok());
        let b = b.as_ref().ok().and_then(|e| e.file_name().into_string().ok());
        b.cmp(&a)
    });
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let saved: Vec<String> = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let saved_norm: Vec<String> = saved.iter().map(|s| s.trim().to_string()).collect();
        if saved_norm.len() == current_norm.len() && saved_norm == current_norm {
            let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
            let pref_ts = stem.strip_prefix("template_").unwrap_or(stem);
            let pref_path = pref_dir.join(format!("pref_{}.json", pref_ts));
            if pref_path.exists() {
                let pref = std::fs::read_to_string(&pref_path).map_err(|e| e.to_string())?;
                return Ok(Some(pref));
            }
        }
    }
    Ok(None)
}

/// pref ディレクトリに JSON を保存（ファイル名の拡張子はフロント側で付与しない前提）
#[tauri::command]
fn write_pref_json(name: String, content: String) -> Result<(), String> {
    let base = stargazer_dir()?;
    let pref_dir = base.join("pref");
    std::fs::create_dir_all(&pref_dir).map_err(|e| e.to_string())?;
    let path = pref_dir.join(format!("{}.json", name));
    std::fs::write(&path, content).map_err(|e| format!("pref 保存失敗: {}", e))
}

/// pref ディレクトリから JSON を読み込む（存在しなければ None）
#[tauri::command]
fn read_pref_json(name: String) -> Result<Option<String>, String> {
    let base = stargazer_dir()?;
    let path = base.join("pref").join(format!("{}.json", name));
    if path.exists() {
        let content = std::fs::read_to_string(&path).map_err(|e| format!("pref 読み込み失敗: {}", e))?;
        Ok(Some(content))
    } else {
        Ok(None)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_app_data_dir,
            ensure_app_dirs,
            check_app_dirs_exist,
            read_cast_db_json,
            write_cast_db_json,
            list_app_data_structure,
            write_backup_lottery_tsv,
            write_backup_matching_tsv,
            read_local_file,
            read_local_csv,
            write_local_csv,
            write_local_file,
            read_pref_json,
            write_pref_json,
            read_template_temp_json,
            write_template_temp_json,
            read_template_pref_json,
            write_template_pref_json,
            get_current_event,
            set_current_event,
            list_events,
            create_event
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
