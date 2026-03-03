use std::path::{Path, PathBuf};
use std::fs;

pub fn get_thumbnail_cache_dir() -> PathBuf {
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let cache_dir = Path::new(&local).join("CosmoArtsStore\\STELLARECORD\\Alpheratz\\thumbnail_cache");
    let _ = fs::create_dir_all(&cache_dir);
    cache_dir
}

pub fn create_thumbnail_file(path: &str) -> Result<String, String> {
    let cache_dir = get_thumbnail_cache_dir();
    let path_p = Path::new(path);
    let filename = path_p.file_name().and_then(|n| n.to_str()).unwrap_or("tmp.png");
    let cache_path = cache_dir.join(format!("{}.thumb.jpg", filename));

    if cache_path.exists() {
        return Ok(cache_path.to_string_lossy().to_string());
    }

    let img = image::open(path).map_err(|e| e.to_string())?;
    let thumb = img.thumbnail(360, 360); 
    thumb.save(&cache_path).map_err(|e| e.to_string())?;

    Ok(cache_path.to_string_lossy().to_string())
}
