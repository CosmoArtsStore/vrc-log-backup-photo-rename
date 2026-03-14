use std::fs::OpenOptions;
use std::io::{self, Write};
use std::path::PathBuf;

use chrono::Local;
use winreg::enums::HKEY_CURRENT_USER;
use winreg::RegKey;

pub fn platform_err<E: std::fmt::Display>(context: &str, err: E) -> String {
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

    let install_path: String = match key.get_value("InstallLocation") {
        Ok(path) => path,
        Err(err) => {
            log_warn(&format!(
                "registry value read failed [{}\\InstallLocation]: {}",
                key_path, err
            ));
            return None;
        }
    };

    let install_dir = PathBuf::from(install_path);
    if !install_dir.exists() {
        log_warn(&format!(
            "install directory does not exist [{}]",
            install_dir.display()
        ));
        return None;
    }

    Some(install_dir)
}

pub fn install_dir() -> Option<PathBuf> {
    get_component_install_dir("Polaris")
}

pub fn archive_dir() -> Option<PathBuf> {
    Some(install_dir()?.join("archive"))
}

pub fn log_path() -> Option<PathBuf> {
    Some(install_dir()?.join("info.log"))
}

fn append_log_line(path: PathBuf, line: &str) -> io::Result<()> {
    let mut log = OpenOptions::new().create(true).append(true).open(path)?;
    writeln!(log, "{}", line)
}

fn log_msg(level: &str, msg: &str) {
    let Some(path) = log_path() else {
        eprintln!("[{}] {} (log path unavailable)", level, msg);
        return;
    };

    let line = format!(
        "[{}] [{}] {}",
        Local::now().format("%Y-%m-%d %H:%M:%S"),
        level,
        msg
    );

    if let Err(err) = append_log_line(path, &line) {
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

pub fn install_panic_hook() {
    std::panic::set_hook(Box::new(|info| {
        let location = match info.location() {
            Some(location) => format!("at {}:{}", location.file(), location.line()),
            None => "unknown location".to_string(),
        };
        let payload = info.payload();
        let message = if let Some(text) = payload.downcast_ref::<&str>() {
            text.to_string()
        } else if let Some(text) = payload.downcast_ref::<String>() {
            text.clone()
        } else {
            "致命的なエラーが発生しました。".to_string()
        };

        log_err(&format!("[PANIC] {} {}", message, location));
    }));
}
