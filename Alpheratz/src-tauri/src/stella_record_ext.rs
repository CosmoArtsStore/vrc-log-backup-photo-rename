use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::utils::get_stella_record_install_dir;

fn get_pleiades_json_path() -> Option<PathBuf> {
    Some(get_stella_record_install_dir()?.join("pleiades.json"))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StellaRecordAppInfo {
    pub name: String,
    pub description: String,
    pub path: String,
    pub icon_path: Option<String>,
}

pub fn register_self(name: &str, description: &str) -> Result<String, String> {
    let current_exe =
        std::env::current_exe().map_err(|e| format!("実行ファイルの取得に失敗しました: {}", e))?;
    let current_exe_str = current_exe.to_string_lossy().to_string();

    let target_file = get_pleiades_json_path()
        .ok_or_else(|| "StellaRecord のインストール先が見つかりません。".to_string())?;

    let mut apps: Vec<StellaRecordAppInfo> = if target_file.exists() {
        let content = fs::read_to_string(&target_file)
            .map_err(|e| format!("ファイルの読み込みに失敗しました: {}", e))?;
        serde_json::from_str(&content).map_err(|e| format!("JSON parse error: {}", e))?
    } else {
        Vec::new()
    };

    let mut updated = false;
    for app in &mut apps {
        if app.name == name {
            app.path = current_exe_str.clone();
            app.description = description.to_string();
            updated = true;
            break;
        }
    }

    if !updated {
        apps.push(StellaRecordAppInfo {
            name: name.to_string(),
            description: description.to_string(),
            path: current_exe_str,
            icon_path: None,
        });
    }

    let json = serde_json::to_string_pretty(&apps)
        .map_err(|e| format!("JSONの構築に失敗しました: {}", e))?;
    fs::write(&target_file, json).map_err(|e| format!("保存に失敗しました: {}", e))?;

    Ok(format!("{} を StellaRecord に登録しました。", name))
}
