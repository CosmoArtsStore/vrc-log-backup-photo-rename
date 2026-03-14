use std::path::PathBuf;

use sysinfo::{ProcessesToUpdate, System};

pub fn vrchat_log_dir() -> Option<PathBuf> {
    // VRChat のログは `%AppData%\..\LocalLow\VRChat\VRChat` に固定で出力される。
    // `dirs` で取得できる既知のユーザーディレクトリから辿ると、環境差分に強い。
    let local_dir = dirs::data_local_dir()?;
    let appdata_dir = local_dir.parent()?;
    Some(appdata_dir.join("LocalLow").join("VRChat").join("VRChat"))
}

pub fn find_vrchat_pid(system: &mut System) -> Option<u32> {
    // 毎回プロセス一覧を更新して、VRChat の起動状態を常に現在値で判定する。
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
