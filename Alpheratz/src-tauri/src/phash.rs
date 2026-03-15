use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use image::imageops::FilterType;
use image::DynamicImage;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::db::open_alpheratz_connection;

const PHASH_BATCH_SIZE: usize = 100;
const PHASH_SIZE: usize = 16;
const LOW_FREQ_SIZE: usize = 8;
const MIN_WORLD_MATCH_SIMILARITY: f32 = 0.9;

pub struct PHashWorkerState {
    pub running: AtomicBool,
    pub progress: Mutex<PHashProgressPayload>,
}

#[derive(Clone, Debug, Serialize, Default)]
pub struct PHashProgressPayload {
    pub done: usize,
    pub total: usize,
    pub current: Option<String>,
}

#[derive(Clone, Debug)]
pub struct PHashWorldMatch {
    pub world_name: String,
    pub similarity: f32,
}

pub fn start_phash_worker(app: AppHandle) {
    let state = app.state::<PHashWorkerState>();
    if state.running.swap(true, Ordering::SeqCst) {
        return;
    }

    tauri::async_runtime::spawn(async move {
        if let Err(err) = run_phash_worker(app.clone()).await {
            crate::utils::log_err(&format!("pHash worker failed: {}", err));
        }

        let state = app.state::<PHashWorkerState>();
        state.running.store(false, Ordering::SeqCst);
        if let Ok(mut progress) = state.progress.lock() {
            progress.current = None;
        }
        emit_event(&app, "phash_complete", ());
    });
}

pub fn get_phash_progress(app: &AppHandle) -> PHashProgressPayload {
    let state = app.state::<PHashWorkerState>();
    state
        .progress
        .lock()
        .map(|progress| progress.clone())
        .unwrap_or_default()
}

pub fn has_pending_phash() -> Result<bool, String> {
    let conn = open_alpheratz_connection()?;
    let count = conn
        .query_row(
            "SELECT COUNT(*) FROM photos WHERE is_missing = 0 AND (phash IS NULL OR phash = '')",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|err| format!("未計算 pHash 件数を取得できません: {}", err))?;
    Ok(count > 0)
}

pub fn has_unknown_worlds() -> Result<bool, String> {
    let conn = open_alpheratz_connection()?;
    let count = conn
        .query_row(
            "SELECT COUNT(*) FROM photos
             WHERE is_missing = 0
               AND (world_name IS NULL OR world_name = '')",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|err| format!("未補完ワールド件数を取得できません: {}", err))?;
    Ok(count > 0)
}

pub fn infer_world_name_from_unknown_photo(path: &Path) -> Result<Option<PHashWorldMatch>, String> {
    let image = image::open(path)
        .map_err(|err| format!("pHash 補完用画像を開けません [{}]: {}", path.display(), err))?;
    let candidate_hashes = compute_rotated_hashes(&image);

    let conn = open_alpheratz_connection()?;
    let mut stmt = conn
        .prepare(
            "SELECT world_name, phash
             FROM photos
             WHERE is_missing = 0
               AND world_name IS NOT NULL
               AND world_name != ''
               AND phash IS NOT NULL
               AND phash != ''",
        )
        .map_err(|err| format!("pHash 補完クエリを準備できません: {}", err))?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
            ))
        })
        .map_err(|err| format!("pHash 補完クエリを実行できません: {}", err))?;

    let mut best_match: Option<PHashWorldMatch> = None;

    for row in rows {
        let (world_name, phash) = match row {
            Ok(value) => value,
            Err(err) => {
                crate::utils::log_warn(&format!("pHash 補完 row decode failed: {}", err));
                continue;
            }
        };
        if phash.len() != 64 {
            continue;
        }

        let best_similarity = candidate_hashes
            .iter()
            .map(|hash| 1.0 - (hamming_distance(hash, &phash) as f32 / 64.0))
            .fold(0.0f32, f32::max);

        if best_similarity < MIN_WORLD_MATCH_SIMILARITY {
            continue;
        }

        let should_replace = best_match
            .as_ref()
            .map(|current| best_similarity > current.similarity)
            .unwrap_or(true);
        if should_replace {
            best_match = Some(PHashWorldMatch {
                world_name,
                similarity: best_similarity,
            });
        }
    }

    Ok(best_match)
}

async fn run_phash_worker(app: AppHandle) -> Result<(), String> {
    let total = tauri::async_runtime::spawn_blocking(count_pending_phash)
        .await
        .map_err(|err| format!("pHash 件数確認タスクの待機に失敗しました: {}", err))??;

    update_progress(&app, 0, total, None);
    if total > 0 {
        let mut done = 0usize;

        loop {
            let batch = tauri::async_runtime::spawn_blocking(fetch_pending_batch)
                .await
                .map_err(|err| format!("pHash 対象取得タスクの待機に失敗しました: {}", err))??;

            if batch.is_empty() {
                break;
            }

            for (filename, path) in batch {
                let app_handle = app.clone();
                let result = tauri::async_runtime::spawn_blocking(move || {
                    let hash = compute_phash_from_path(&path)?;
                    let conn = open_alpheratz_connection()?;
                    conn.execute(
                        "UPDATE photos SET phash = ?1 WHERE photo_path = ?2",
                        rusqlite::params![hash, path],
                    )
                    .map_err(|err| format!("pHash を保存できません [{}]: {}", path, err))?;
                    Ok::<(), String>(())
                })
                .await
                .map_err(|err| format!("pHash 計算タスクの待機に失敗しました [{}]: {}", filename, err))?;

                if let Err(err) = result {
                    crate::utils::log_warn(&format!("pHash skipped [{}]: {}", filename, err));
                }

                done += 1;
                update_progress(&app_handle, done, total, Some(filename.clone()));
                emit_event(&app_handle, "phash_progress", get_phash_progress(&app_handle));
            }
        }
    }

    tauri::async_runtime::spawn_blocking(reconcile_unknown_worlds_from_phash)
        .await
        .map_err(|err| format!("pHash 補完再評価タスクの待機に失敗しました: {}", err))??;

    Ok(())
}

fn count_pending_phash() -> Result<usize, String> {
    let conn = open_alpheratz_connection()?;
    let count = conn
        .query_row(
            "SELECT COUNT(*) FROM photos WHERE is_missing = 0 AND (phash IS NULL OR phash = '')",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|err| format!("未計算 pHash 件数を取得できません: {}", err))?;
    Ok(count.max(0) as usize)
}

fn fetch_pending_batch() -> Result<Vec<(String, String)>, String> {
    let conn = open_alpheratz_connection()?;
    let mut stmt = conn
        .prepare(
            "SELECT photo_filename, photo_path
             FROM photos
             WHERE is_missing = 0
               AND (phash IS NULL OR phash = '')
             ORDER BY timestamp DESC
             LIMIT ?1",
        )
        .map_err(|err| format!("pHash 対象クエリを準備できません: {}", err))?;
    let rows = stmt
        .query_map([PHASH_BATCH_SIZE as i64], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|err| format!("pHash 対象クエリを実行できません: {}", err))?;

    let mut batch = Vec::new();
    for row in rows {
        match row {
            Ok(item) => batch.push(item),
            Err(err) => crate::utils::log_warn(&format!("pHash target row decode failed: {}", err)),
        }
    }
    Ok(batch)
}

fn reconcile_unknown_worlds_from_phash() -> Result<(), String> {
    let conn = open_alpheratz_connection()?;
    let mut stmt = conn
        .prepare(
            "SELECT photo_path
             FROM photos
             WHERE is_missing = 0
               AND (world_name IS NULL OR world_name = '')
             ORDER BY timestamp DESC",
        )
        .map_err(|err| format!("pHash 補完対象クエリを準備できません: {}", err))?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|err| format!("pHash 補完対象クエリを実行できません: {}", err))?;

    let mut targets = Vec::new();
    for row in rows {
        match row {
            Ok(path) => targets.push(path),
            Err(err) => crate::utils::log_warn(&format!("pHash reconcile row decode failed: {}", err)),
        }
    }

    for photo_path in targets {
        let path = Path::new(&photo_path);
        if !path.exists() {
            continue;
        }

        let Some(world_match) = infer_world_name_from_unknown_photo(path)? else {
            continue;
        };

        conn.execute(
            "UPDATE photos
             SET world_name = ?1,
                 match_source = 'phash'
             WHERE photo_path = ?2
               AND (world_name IS NULL OR world_name = '')",
            rusqlite::params![world_match.world_name, photo_path],
        )
        .map_err(|err| format!("pHash 補完結果を保存できません [{}]: {}", photo_path, err))?;
    }

    Ok(())
}

fn update_progress(app: &AppHandle, done: usize, total: usize, current: Option<String>) {
    let state = app.state::<PHashWorkerState>();
    if let Ok(mut progress) = state.progress.lock() {
        progress.done = done;
        progress.total = total;
        progress.current = current;
    };
}

fn emit_event<T: Serialize + Clone>(app: &AppHandle, event: &str, payload: T) {
    if let Err(err) = app.emit(event, payload) {
        crate::utils::log_warn(&format!("emit failed [{}]: {}", event, err));
    }
}

fn compute_phash_from_path(path: &str) -> Result<String, String> {
    let image = image::open(path).map_err(|err| format!("画像を開けません [{}]: {}", path, err))?;
    Ok(compute_phash(&image))
}

fn compute_rotated_hashes(image: &DynamicImage) -> [String; 4] {
    [
        compute_phash(image),
        compute_phash(&image.rotate90()),
        compute_phash(&image.rotate180()),
        compute_phash(&image.rotate270()),
    ]
}

fn compute_phash(image: &DynamicImage) -> String {
    let grayscale = image.grayscale();
    let resized = grayscale.resize_exact(PHASH_SIZE as u32, PHASH_SIZE as u32, FilterType::Nearest);
    let buffer = resized.to_luma8();
    let pixels: Vec<f32> = buffer.pixels().map(|pixel| f32::from(pixel[0])).collect();
    let dct = compute_dct(&pixels, PHASH_SIZE);

    let mut low_freq = Vec::with_capacity(LOW_FREQ_SIZE * LOW_FREQ_SIZE);
    for y in 0..LOW_FREQ_SIZE {
        for x in 0..LOW_FREQ_SIZE {
            low_freq.push(dct[y * PHASH_SIZE + x]);
        }
    }

    let mut sorted = low_freq[1..].to_vec();
    sorted.sort_by(|left, right| left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal));
    let median = sorted[sorted.len() / 2];

    low_freq
        .into_iter()
        .map(|value| if value >= median { '1' } else { '0' })
        .collect()
}

fn compute_dct(pixels: &[f32], size: usize) -> Vec<f32> {
    let mut output = vec![0.0; size * size];
    let size_f = size as f32;

    for v in 0..size {
        for u in 0..size {
            let mut sum = 0.0f32;
            for y in 0..size {
                for x in 0..size {
                    let pixel = pixels[y * size + x];
                    let x_term = ((std::f32::consts::PI * (2.0 * x as f32 + 1.0) * u as f32)
                        / (2.0 * size_f))
                        .cos();
                    let y_term = ((std::f32::consts::PI * (2.0 * y as f32 + 1.0) * v as f32)
                        / (2.0 * size_f))
                        .cos();
                    sum += pixel * x_term * y_term;
                }
            }
            let alpha_u = if u == 0 {
                (1.0 / size_f).sqrt()
            } else {
                (2.0 / size_f).sqrt()
            };
            let alpha_v = if v == 0 {
                (1.0 / size_f).sqrt()
            } else {
                (2.0 / size_f).sqrt()
            };
            output[v * size + u] = alpha_u * alpha_v * sum;
        }
    }

    output
}

fn hamming_distance(left: &str, right: &str) -> usize {
    left.chars()
        .zip(right.chars())
        .filter(|(left_bit, right_bit)| left_bit != right_bit)
        .count()
}
