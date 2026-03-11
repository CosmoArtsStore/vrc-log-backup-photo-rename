use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

fn get_stellarecord_install_dir() -> Option<PathBuf> {
    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\CosmoArtsStore\\STELLAProject\\StellaRecord").ok()?;
    let path: String = key.get_value("InstallLocation").ok()?;
    Some(PathBuf::from(path))
}

fn get_pleiades_json_path() -> Option<PathBuf> {
    Some(get_stellarecord_install_dir()?.join("pleiades.json"))
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StellaRecordAppInfo {
    pub name: String,
    pub description: String,
    pub path: String,
    pub icon_path: Option<String>,
}

pub fn register_self(name: &str, description: &str) -> Result<String, String> {
    // 1. 本アプリのパスを取得
    let current_exe = std::env::current_exe()
        .map_err(|e| format!("実行ファイルの取得に失敗しました: {}", e))?;
    let current_exe_str = current_exe.to_string_lossy().to_string();

    // 2. StellaRecord の pleiades.json パスを取得
    let target_file = get_pleiades_json_path()
        .ok_or_else(|| "StellaRecord のインストール先が見つかりません。".to_string())?;

    // 3. 既存のリストを読み込み
    let mut apps: Vec<StellaRecordAppInfo> = if target_file.exists() {
        let content = fs::read_to_string(&target_file)
            .map_err(|e| format!("ファイルの読み込みに失敗しました: {}", e))?;
        serde_json::from_str(&content).unwrap_or_else(|_| Vec::new())
    } else {
        Vec::new()
    };

    // 4. 重複チェック（既に同じパスがあれば更新）
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
            icon_path: None, // 必要に応じて追加
        });
    }

    // 5. 保存
    let json = serde_json::to_string_pretty(&apps)
        .map_err(|e| format!("JSONの構築に失敗しました: {}", e))?;
    fs::write(&target_file, json)
        .map_err(|e| format!("保存に失敗しました: {}", e))?;

    Ok(format!("{} を StellaRecord に登録しました。", name))
}
