use std::fs::OpenOptions;
use std::path::Path;
use std::path::PathBuf;

use anyhow::{anyhow, Context, Result};
use log::error;
use simplelog::{Config, LevelFilter, WriteLogger};
use winreg::enums::{HKEY_CURRENT_USER, KEY_READ};
use winreg::RegKey;

#[derive(Clone)]
pub struct RuntimePaths {
    pub archive_dir: PathBuf,
    pub log_path: PathBuf,
    pub vrchat_log_dir: PathBuf,
}

pub fn build_runtime_paths(install_dir: PathBuf) -> RuntimePaths {
    let vrchat_log_dir = PathBuf::from(std::env::var_os("USERPROFILE").expect("USERPROFILE should exist on Windows"))
        .join("AppData")
        .join("LocalLow")
        .join("VRChat")
        .join("VRChat");

    RuntimePaths {
        archive_dir: install_dir.join("archive"),
        log_path: install_dir.join("info.log"),
        vrchat_log_dir,
    }
}

pub fn read_install_dir_from_registry() -> Result<PathBuf> {
    let install_path: String = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey_with_flags("Software\\CosmoArtsStore\\STELLAProject\\Polaris", KEY_READ)
        .and_then(|key| key.get_value("InstallLocation"))
        .map_err(|_| anyhow!("インストール情報を取得できませんでした。再インストールしてください。"))?;
    Ok(PathBuf::from(install_path))
}

pub fn init_logger(log_path: &Path) -> Result<()> {
    let log_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .context("ログファイルを開けませんでした")?;
    WriteLogger::init(LevelFilter::Info, Config::default(), log_file)
        .map_err(|err| anyhow!("ロガーを初期化できませんでした: {}", err))?;
    Ok(())
}

pub fn install_panic_hook() {
    std::panic::set_hook(Box::new(|info| {
        error!(
            "予期しないエラーが発生しました [{}]",
            info.location()
                .map(|location| format!("{}:{}", location.file(), location.line()))
                .unwrap_or_else(|| "場所は特定できませんでした".to_string())
        );
    }));
}
