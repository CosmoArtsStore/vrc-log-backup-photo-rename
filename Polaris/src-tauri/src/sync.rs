use std::fs;

use crate::platform;
use crate::utils;

pub fn sync_logs() {
    let destination_dir = match utils::archive_dir() {
        Some(path) => path,
        None => {
            utils::log_err("インストール先をレジストリから取得できません");
            return;
        }
    };

    if let Err(err) = fs::create_dir_all(&destination_dir) {
        utils::log_err(&format!(
            "Cannot create archive dir ({}): {}",
            destination_dir.display(),
            err
        ));
        return;
    }

    let source_dir = match platform::vrchat_log_dir() {
        Some(path) => path,
        None => {
            utils::log_err("AppDataが取得できません");
            return;
        }
    };

    let entries = match fs::read_dir(&source_dir) {
        Ok(entries) => entries,
        Err(err) => {
            utils::log_err(&format!(
                "Cannot read VRChat log dir [{}]: {}",
                source_dir.display(),
                err
            ));
            return;
        }
    };

    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(err) => {
                utils::log_warn(&format!("Entry read error: {}", err));
                continue;
            }
        };

        let source_path = entry.path();
        let Some(file_name) = source_path
            .file_name()
            .and_then(|name| name.to_str())
            .map(str::to_string)
        else {
            utils::log_warn("unexpected file name decode failure in VRChat log directory");
            continue;
        };

        if !file_name.starts_with("output_log_") || !file_name.ends_with(".txt") {
            continue;
        }

        let destination_path = destination_dir.join(&file_name);
        let source_meta = match fs::metadata(&source_path) {
            Ok(metadata) => metadata,
            Err(err) => {
                utils::log_warn(&format!("stat src [{}] failed: {}", file_name, err));
                continue;
            }
        };

        let source_size = source_meta.len();
        let source_mtime = source_meta.modified().ok();
        let destination_meta = fs::metadata(&destination_path).ok();
        let destination_size = destination_meta
            .as_ref()
            .map(|meta| meta.len())
            .unwrap_or(0);
        let destination_mtime = destination_meta.and_then(|meta| meta.modified().ok());

        let needs_copy = if destination_size == 0 {
            true
        } else if source_size > destination_size {
            true
        } else if source_size == destination_size {
            match (source_mtime, destination_mtime) {
                (Some(source_time), Some(dest_time)) => source_time > dest_time,
                _ => false,
            }
        } else {
            utils::log_warn(&format!(
                "src smaller than dst [{}]: src={} dst={}",
                file_name, source_size, destination_size
            ));
            false
        };

        if !needs_copy {
            continue;
        }

        if source_size == destination_size {
            utils::log_warn(&format!(
                "src size same as dst but mtime is newer [{}]: re-copying",
                file_name
            ));
        }

        if let Err(copy_err) = fs::copy(&source_path, &destination_path) {
            copy_with_share_mode_fallback(&source_path, &destination_path, &file_name, copy_err);
        }
    }
}

fn copy_with_share_mode_fallback(
    source_path: &std::path::Path,
    destination_path: &std::path::Path,
    file_name: &str,
    initial_err: std::io::Error,
) {
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        use windows::Win32::Storage::FileSystem::FILE_SHARE_READ;

        let result = fs::OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ.0)
            .open(source_path)
            .and_then(|mut source_file| {
                let mut destination_file = fs::File::create(destination_path)?;
                std::io::copy(&mut source_file, &mut destination_file)
            });

        if let Err(fallback_err) = result {
            utils::log_err(&format!(
                "copy failed (share mode fallback also failed) [{}]: {} / {}",
                file_name, initial_err, fallback_err
            ));
        }
    }

    #[cfg(not(windows))]
    {
        utils::log_err(&format!("copy failed [{}]: {}", file_name, initial_err));
    }
}
