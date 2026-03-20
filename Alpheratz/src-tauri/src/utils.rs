use chrono::Local;
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

const REGISTRY_BASE_KEY: &str = "Software\\CosmoArtsStore\\STELLAProject";
const LOG_FILE_PREFIX: &str = "info";

fn write_bootstrap_log(level: &str, msg: &str) {
    let fallback_dir = std::env::temp_dir().join("STELLAProject").join("Alpheratz");
    if let Err(err) = fs::create_dir_all(&fallback_dir) {
        eprintln!(
            "[Alpheratz][WARN] bootstrap log dir create failed [{}]: {}",
            fallback_dir.display(),
            err
        );
        return;
    }

    let month = Local::now().format("%Y%m");
    let path = fallback_dir.join(format!("{LOG_FILE_PREFIX}_{month}.log"));
    match OpenOptions::new().create(true).append(true).open(&path) {
        Ok(mut file) => {
            let now = Local::now().format("%Y-%m-%d %H:%M:%S");
            if let Err(err) = writeln!(file, "[{}] [{}] {}", now, level, msg) {
                eprintln!(
                    "[Alpheratz][WARN] bootstrap log write failed [{}]: {}",
                    path.display(),
                    err
                );
            }
        }
        Err(err) => {
            eprintln!(
                "[Alpheratz][WARN] bootstrap log open failed [{}]: {}",
                path.display(),
                err
            );
        }
    }
}

fn get_monthly_log_path(base_dir: &Path) -> PathBuf {
    let month = Local::now().format("%Y%m");
    base_dir.join(format!("{LOG_FILE_PREFIX}_{month}.log"))
}

pub fn get_registry_component_install_dir(component: &str) -> Option<PathBuf> {
    let key_path = format!("{}\\{}", REGISTRY_BASE_KEY, component);
    let key = match RegKey::predef(HKEY_CURRENT_USER).open_subkey(&key_path) {
        Ok(key) => key,
        Err(err) => {
            write_bootstrap_log(
                "WARN",
                &format!("registry open failed [{}]: {}", key_path, err),
            );
            return None;
        }
    };

    let path: String = match key.get_value("InstallLocation") {
        Ok(path) => path,
        Err(err) => {
            write_bootstrap_log(
                "WARN",
                &format!(
                    "registry value read failed [{}\\InstallLocation]: {}",
                    key_path, err
                ),
            );
            return None;
        }
    };

    let path_buf = PathBuf::from(path);
    if path_buf.exists() {
        Some(path_buf)
    } else {
        write_bootstrap_log(
            "WARN",
            &format!("install dir does not exist: {}", path_buf.display()),
        );
        None
    }
}

pub fn get_alpheratz_install_dir() -> Option<PathBuf> {
    get_registry_component_install_dir("Alpheratz")
}

pub fn get_alpheratz_data_dir() -> Option<PathBuf> {
    let data_dir = get_alpheratz_install_dir()?.join("data");
    if let Err(err) = fs::create_dir_all(&data_dir) {
        write_bootstrap_log(
            "WARN",
            &format!("data dir create failed [{}]: {}", data_dir.display(), err),
        );
        return None;
    }
    Some(data_dir)
}

pub fn get_alpheratz_log_dir() -> Option<PathBuf> {
    let log_dir = get_alpheratz_data_dir()?.join("log");
    if let Err(err) = fs::create_dir_all(&log_dir) {
        write_bootstrap_log(
            "WARN",
            &format!("log dir create failed [{}]: {}", log_dir.display(), err),
        );
        return None;
    }
    Some(log_dir)
}

pub fn get_alpheratz_cache_dir() -> Option<PathBuf> {
    let cache_dir = get_alpheratz_data_dir()?.join("cache");
    if let Err(err) = fs::create_dir_all(&cache_dir) {
        write_bootstrap_log(
            "WARN",
            &format!("cache dir create failed [{}]: {}", cache_dir.display(), err),
        );
        return None;
    }
    Some(cache_dir)
}

fn slot_cache_folder_name(source_slot: i64) -> &'static str {
    if source_slot == 2 {
        "2nd-cache"
    } else {
        "1st-cache"
    }
}

pub fn get_alpheratz_slot_cache_dir(source_slot: i64) -> Option<PathBuf> {
    let slot_cache_dir = get_alpheratz_cache_dir()?.join(slot_cache_folder_name(source_slot));
    if let Err(err) = fs::create_dir_all(&slot_cache_dir) {
        write_bootstrap_log(
            "WARN",
            &format!(
                "slot cache dir create failed [{}]: {}",
                slot_cache_dir.display(),
                err
            ),
        );
        return None;
    }
    Some(slot_cache_dir)
}

pub fn get_alpheratz_setting_dir() -> Option<PathBuf> {
    let setting_dir = get_alpheratz_data_dir()?.join("setting");
    if let Err(err) = fs::create_dir_all(&setting_dir) {
        write_bootstrap_log(
            "WARN",
            &format!(
                "setting dir create failed [{}]: {}",
                setting_dir.display(),
                err
            ),
        );
        return None;
    }
    Some(setting_dir)
}

pub fn get_alpheratz_backup_dir() -> Option<PathBuf> {
    let backup_dir = get_alpheratz_data_dir()?.join("backup");
    if let Err(err) = fs::create_dir_all(&backup_dir) {
        write_bootstrap_log(
            "WARN",
            &format!(
                "backup dir create failed [{}]: {}",
                backup_dir.display(),
                err
            ),
        );
        return None;
    }
    Some(backup_dir)
}

pub fn get_alpheratz_db_cache_dir(_source_slot: i64) -> Option<PathBuf> {
    let db_cache_dir = get_alpheratz_cache_dir()?
        .join("shared-cache")
        .join("dbCache");
    if let Err(err) = fs::create_dir_all(&db_cache_dir) {
        write_bootstrap_log(
            "WARN",
            &format!(
                "db cache dir create failed [{}]: {}",
                db_cache_dir.display(),
                err
            ),
        );
        return None;
    }
    Some(db_cache_dir)
}

pub fn get_alpheratz_img_cache_dir(source_slot: i64) -> Option<PathBuf> {
    let img_cache_dir = get_alpheratz_slot_cache_dir(source_slot)?.join("imgCache");
    if let Err(err) = fs::create_dir_all(&img_cache_dir) {
        write_bootstrap_log(
            "WARN",
            &format!(
                "img cache dir create failed [{}]: {}",
                img_cache_dir.display(),
                err
            ),
        );
        return None;
    }
    Some(img_cache_dir)
}

pub fn clear_directory_contents(dir: &Path) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }

    let entries = fs::read_dir(dir)
        .map_err(|err| format!("directory read failed [{}]: {}", dir.display(), err))?;

    for entry in entries {
        let entry = entry
            .map_err(|err| format!("directory entry read failed [{}]: {}", dir.display(), err))?;
        let path = entry.path();
        if path.is_dir() {
            fs::remove_dir_all(&path)
                .map_err(|err| format!("directory remove failed [{}]: {}", path.display(), err))?;
        } else {
            fs::remove_file(&path)
                .map_err(|err| format!("file remove failed [{}]: {}", path.display(), err))?;
        }
    }

    Ok(())
}

pub fn get_stella_record_install_dir() -> Option<PathBuf> {
    get_registry_component_install_dir("STELLA_RECORD")
        .or_else(|| get_registry_component_install_dir("StellaRecord"))
}

pub fn log_msg(level: &str, msg: &str) {
    if let Some(log_dir) = get_alpheratz_log_dir() {
        let path = get_monthly_log_path(&log_dir);
        match OpenOptions::new().create(true).append(true).open(&path) {
            Ok(mut file) => {
                let now = Local::now().format("%Y-%m-%d %H:%M:%S");
                if let Err(err) = writeln!(file, "[{}] [{}] {}", now, level, msg) {
                    write_bootstrap_log(
                        "WARN",
                        &format!("log write failed [{}]: {}", path.display(), err),
                    );
                }
            }
            Err(err) => {
                write_bootstrap_log(
                    "WARN",
                    &format!("log open failed [{}]: {}", path.display(), err),
                );
            }
        }
    } else {
        write_bootstrap_log(level, msg);
    }
}

pub fn log_warn(msg: &str) {
    log_msg("WARN", msg);
}

pub fn log_err(msg: &str) {
    log_msg("ERROR", msg);
}

pub fn get_thumbnail_cache_dir() -> Result<PathBuf, String> {
    let install_dir = get_alpheratz_install_dir()
        .ok_or_else(|| "Alpheratz のインストール先を取得できません".to_string())?;
    let cache_dir = install_dir.join("cache");
    fs::create_dir_all(&cache_dir).map_err(|e| {
        format!(
            "サムネイルキャッシュフォルダを作成できません ({}): {}",
            cache_dir.display(),
            e
        )
    })?;
    Ok(cache_dir)
}

fn create_thumbnail_file_with_size(
    path: &str,
    source_slot: i64,
    size: u32,
    cache_version: &str,
) -> Result<String, String> {
    let cache_dir = get_alpheratz_img_cache_dir(source_slot)
        .ok_or_else(|| "Alpheratz の imgCache フォルダを取得できません".to_string())?;
    let path_p = Path::new(path);
    let filename = path_p
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("サムネイル対象のファイル名を解決できません: {}", path))?;
    let cache_path = cache_dir.join(format!("{}.thumb.{}.jpg", filename, cache_version));

    if cache_path.exists() {
        return Ok(cache_path.to_string_lossy().to_string());
    }

    let img =
        image::open(path).map_err(|e| format!("サムネイル用画像を開けません ({}): {}", path, e))?;
    let thumb = img.thumbnail(size, size);
    thumb.save(&cache_path).map_err(|e| {
        format!(
            "サムネイルを保存できません ({}): {}",
            cache_path.display(),
            e
        )
    })?;

    Ok(cache_path.to_string_lossy().to_string())
}

pub fn create_thumbnail_file(path: &str, source_slot: i64) -> Result<String, String> {
    create_thumbnail_file_with_size(path, source_slot, 192, "pdq.v1")
}

pub fn create_display_thumbnail_file(path: &str, source_slot: i64) -> Result<String, String> {
    // 大きめ表示向けキャッシュ。小さい一覧には使わない。
    create_thumbnail_file_with_size(path, source_slot, 514, "display.v2")
}

pub fn create_grid_thumbnail_file(path: &str, source_slot: i64) -> Result<String, String> {
    // WebView2 GPU プロセスの負荷を抑えつつ視認性を保つため、一覧表示は中間サイズにする。
    create_thumbnail_file_with_size(path, source_slot, 384, "grid.v2")
}

pub fn copy_photo_files(photo_paths: &[String], destination_dir: &str) -> Result<usize, String> {
    let destination_path = Path::new(destination_dir);
    if !destination_path.exists() {
        return Err(format!(
            "コピー先フォルダが見つかりません: {}",
            destination_path.display()
        ));
    }
    if !destination_path.is_dir() {
        return Err(format!(
            "コピー先がフォルダではありません: {}",
            destination_path.display()
        ));
    }

    let mut copied_count = 0usize;

    for photo_path in photo_paths {
        let source_path = Path::new(photo_path);
        if !source_path.exists() {
            return Err(format!("コピー元ファイルが見つかりません: {}", source_path.display()));
        }

        let file_name = source_path.file_name().ok_or_else(|| {
            format!("コピー元ファイル名を解決できません: {}", source_path.display())
        })?;
        let destination_file = unique_copy_target(destination_path, file_name);
        fs::copy(source_path, &destination_file).map_err(|err| {
            format!(
                "ファイルをコピーできません [{} -> {}]: {}",
                source_path.display(),
                destination_file.display(),
                err
            )
        })?;
        copied_count += 1;
    }

    Ok(copied_count)
}

fn unique_copy_target(destination_dir: &Path, file_name: &std::ffi::OsStr) -> PathBuf {
    let initial_target = destination_dir.join(file_name);
    if !initial_target.exists() {
        return initial_target;
    }

    let stem = Path::new(file_name)
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "copy".to_string());
    let extension = Path::new(file_name)
        .extension()
        .map(|value| value.to_string_lossy().to_string());

    let mut index = 1usize;
    loop {
        let candidate_name = match &extension {
            Some(extension) if !extension.is_empty() => format!("{stem}_{index}.{extension}"),
            _ => format!("{stem}_{index}"),
        };
        let candidate = destination_dir.join(candidate_name);
        if !candidate.exists() {
            return candidate;
        }
        index += 1;
    }
}

pub fn set_startup_enabled(value_name: &str, enabled: bool) -> Result<(), String> {
    let run_key = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
        .map_err(|err| format!("Windows の自動起動レジストリを開けません: {}", err))?
        .0;

    if enabled {
        let executable = std::env::current_exe()
            .map_err(|err| format!("実行中の Alpheratz パスを取得できません: {}", err))?;
        let command = format!("\"{}\"", executable.display());
        run_key
            .set_value(value_name, &command)
            .map_err(|err| format!("自動起動を登録できません: {}", err))?;
    } else if let Err(err) = run_key.delete_value(value_name) {
        if err.kind() != std::io::ErrorKind::NotFound {
            return Err(format!("自動起動設定を削除できません: {}", err));
        }
    }

    Ok(())
}
