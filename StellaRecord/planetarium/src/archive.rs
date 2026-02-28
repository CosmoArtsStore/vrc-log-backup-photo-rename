use std::fs::{self, File};
use std::path::Path;

pub fn compress_to_tar_zst(log_path: &Path, archive_dir: &Path, timestamp_str: &str) -> std::io::Result<()> {
    let name = format!("{}.tar.zst", timestamp_str);
    let dest_path = archive_dir.join("zip").join(name);
    
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent)?;
    }
    
    let tar_zst_file = File::create(&dest_path)?;
    // 圧縮レベル 1 (パフォーマンス最優先)
    let encoder = zstd::stream::Encoder::new(tar_zst_file, 1)?;
    let mut builder = tar::Builder::new(encoder.auto_finish());
    
    let filename = log_path.file_name().unwrap_or_default().to_str().unwrap_or("log.txt");
    builder.append_path_with_name(log_path, filename)?;
    builder.into_inner()?;
    
    // 元のファイルを削除
    fs::remove_file(log_path)?;
    
    Ok(())
}

pub fn collect_log_files(archive_dir: &Path) -> Vec<std::path::PathBuf> {
    let mut files = Vec::new();
    if !archive_dir.exists() {
        return files;
    }
    if let Ok(entries) = fs::read_dir(archive_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.starts_with("output_log_") && name.ends_with(".txt") {
                        files.push(path);
                    }
                }
            }
        }
    }
    files.sort();
    files
}
