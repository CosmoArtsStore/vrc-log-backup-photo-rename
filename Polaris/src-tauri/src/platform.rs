use std::path::PathBuf;

use sysinfo::{ProcessesToUpdate, System};

pub fn vrchat_log_dir() -> Option<PathBuf> {
    let local_dir = dirs::data_local_dir()?;
    let appdata_dir = local_dir.parent()?;
    Some(appdata_dir.join("LocalLow").join("VRChat").join("VRChat"))
}

pub fn find_vrchat_pid(system: &mut System) -> Option<u32> {
    system.refresh_processes(ProcessesToUpdate::All, false);
    system
        .processes()
        .values()
        .find(|process| {
            let process_name = process.name().to_string_lossy();
            process_name.eq_ignore_ascii_case("vrchat.exe")
                || process_name.eq_ignore_ascii_case("vrchat")
        })
        .map(|process| process.pid().as_u32())
}
