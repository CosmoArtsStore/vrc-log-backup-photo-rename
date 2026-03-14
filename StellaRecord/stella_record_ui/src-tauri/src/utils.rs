use std::fs::{self, OpenOptions};
use std::io::{self, BufRead, BufReader, Write};
use std::path::PathBuf;

use chrono::Local;
use tauri::{AppHandle, Emitter};
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

pub fn command_err<E: std::fmt::Display>(context: &str, err: E) -> String {
    format!("{}: {}", context, err)
}

pub fn get_component_install_dir(component_name: &str) -> Option<PathBuf> {
    let key_path = format!(
        "Software\\CosmoArtsStore\\STELLAProject\\{}",
        component_name
    );
    let root = RegKey::predef(HKEY_CURRENT_USER);
    let key = match root.open_subkey(&key_path) {
        Ok(key) => key,
        Err(err) => {
            log_warn(&format!("registry open failed [{}]: {}", key_path, err));
            return None;
        }
    };

    let path: String = match key.get_value("InstallLocation") {
        Ok(path) => path,
        Err(err) => {
            log_warn(&format!(
                "registry value read failed [{}\\InstallLocation]: {}",
                key_path, err
            ));
            return None;
        }
    };

    let install_dir = PathBuf::from(path);
    if !install_dir.exists() {
        log_warn(&format!(
            "install directory does not exist [{}]",
            install_dir.display()
        ));
        return None;
    }

    Some(install_dir)
}

pub fn get_stellarecord_install_dir() -> Option<PathBuf> {
    get_component_install_dir("StellaRecord")
}

pub fn get_polaris_install_dir() -> Option<PathBuf> {
    get_component_install_dir("Polaris")
}

fn append_log(level: &str, msg: &str) -> io::Result<()> {
    let Some(log_path) = get_stellarecord_install_dir().map(|path| path.join("info.log")) else {
        return Err(io::Error::new(
            io::ErrorKind::NotFound,
            "StellaRecord install directory not found",
        ));
    };

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)?;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S");
    writeln!(file, "[{}] [{}] {}", now, level, msg)
}

fn log_msg(level: &str, msg: &str) {
    if let Err(err) = append_log(level, msg) {
        // Intentional: when the file logger itself fails, stderr is the last safe fallback.
        eprintln!("[{}] {} (log fallback error: {})", level, msg, err);
    }
}

pub fn log_warn(msg: &str) {
    log_msg("WARN", msg);
}

pub fn log_err(msg: &str) {
    log_msg("ERROR", msg);
}

pub fn emit_event_warn<T: serde::Serialize + Clone>(app: &AppHandle, event_name: &str, payload: T) {
    if let Err(err) = app.emit(event_name, payload) {
        log_warn(&format!("emit failed [{}]: {}", event_name, err));
    }
}

pub fn read_recent_lines(path: PathBuf, limit: usize) -> Result<Vec<String>, String> {
    #[cfg(windows)]
    let file = {
        use std::os::windows::fs::OpenOptionsExt;
        use windows::Win32::Storage::FileSystem::FILE_SHARE_READ;

        fs::OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ.0)
            .open(&path)
            .map_err(|err| command_err(&format!("Failed to open {}", path.display()), err))?
    };

    #[cfg(not(windows))]
    let file = fs::File::open(&path)
        .map_err(|err| command_err(&format!("Failed to open {}", path.display()), err))?;

    let reader = BufReader::new(file);
    let mut lines: Vec<String> = Vec::new();
    for line in reader.lines() {
        match line {
            Ok(line) => lines.push(line),
            Err(err) => log_warn(&format!(
                "log line read failed [{}]: {}",
                path.display(),
                err
            )),
        }
    }

    if lines.len() > limit {
        lines = lines.split_off(lines.len() - limit);
    }

    Ok(lines)
}
