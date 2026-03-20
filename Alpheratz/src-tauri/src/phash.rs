use std::collections::HashSet;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::thread;

use pdqhash::generate_pdq;
use pdqhash::image::{self, DynamicImage};
use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::db::open_alpheratz_connection;
use crate::utils;

const PHASH_BATCH_SIZE: usize = 100;
const PHASH_VERSION: i64 = 2;
const PHASH_WORKER_LIMIT: usize = 4;
const PHASH_UPDATE_BATCH_SIZE: usize = 32;
const PHASH_PROGRESS_EMIT_INTERVAL: usize = 16;

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

#[derive(Clone, Debug)]
struct PdqComputeResult {
    source_slot: i64,
    path: String,
    filename: String,
    hash: Option<String>,
    error: Option<String>,
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
    let progress = match state.progress.lock() {
        Ok(progress) => progress.clone(),
        Err(err) => {
            crate::utils::log_warn(&format!("PDQ 進捗状態を読み取れませんでした: {}", err));
            PHashProgressPayload::default()
        }
    };
    progress
}

pub fn has_pending_phash() -> Result<bool, String> {
    let conn = open_alpheratz_connection(1)?;
    let count = conn
        .query_row(
            "SELECT COUNT(*) FROM photos
             WHERE is_missing = 0
               AND (
                 phash IS NULL
                 OR phash = ''
                 OR COALESCE(phash_version, 0) != ?1
               )",
            [PHASH_VERSION],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|err| format!("未計算の PDQ 件数を取得できません: {}", err))?;
    Ok(count > 0)
}

pub fn has_unknown_worlds() -> Result<bool, String> {
    Ok(false)
}

pub fn infer_world_name_from_unknown_photo(
    _path: &Path,
) -> Result<Option<PHashWorldMatch>, String> {
    Ok(None)
}

async fn run_phash_worker(app: AppHandle) -> Result<(), String> {
    let mut total = tauri::async_runtime::spawn_blocking(count_pending_phash)
        .await
        .map_err(|err| format!("PDQ 件数取得タスクの join に失敗しました: {}", err))??;

    update_progress(&app, 0, total, None);
    if total > 0 {
        let mut done = 0usize;
        let mut attempted_paths = HashSet::new();

        loop {
            let batch = tauri::async_runtime::spawn_blocking(fetch_pending_batch)
                .await
                .map_err(|err| format!("PDQ 対象取得タスクの join に失敗しました: {}", err))??;

            let mut pending_batch = Vec::with_capacity(batch.len());
            for item in batch {
                if attempted_paths.contains(&item.2) {
                    continue;
                }
                attempted_paths.insert(item.2.clone());
                pending_batch.push(item);
            }

            if pending_batch.is_empty() {
                break;
            }

            if done + pending_batch.len() > total {
                total = done + pending_batch.len();
                update_progress(&app, done, total, None);
                emit_event(&app, "phash_progress", get_phash_progress(&app));
            }

            let batch_results =
                tauri::async_runtime::spawn_blocking(move || compute_pdq_batch(pending_batch))
                    .await
                    .map_err(|err| {
                        format!("PDQ バッチ計算タスクの join に失敗しました: {}", err)
                    })??;

            let conn = open_alpheratz_connection(1)?;
            for chunk in batch_results.chunks(PHASH_UPDATE_BATCH_SIZE) {
                apply_pdq_updates(&conn, chunk)?;

                for result in chunk {
                    done += 1;
                    if let Some(err) = &result.error {
                        crate::utils::log_warn(&format!(
                            "PDQ skipped [{}]: {}",
                            result.filename, err
                        ));
                    }

                    update_progress(&app, done, total, Some(result.filename.clone()));
                    if done % PHASH_PROGRESS_EMIT_INTERVAL == 0 || done == total {
                        emit_event(&app, "phash_progress", get_phash_progress(&app));
                    }
                }
            }
        }
    }

    Ok(())
}

fn count_pending_phash() -> Result<usize, String> {
    let conn = open_alpheratz_connection(1)?;
    let count = conn
        .query_row(
            "SELECT COUNT(*) FROM photos
             WHERE is_missing = 0
               AND (
                 phash IS NULL
                 OR phash = ''
                 OR COALESCE(phash_version, 0) != ?1
               )",
            [PHASH_VERSION],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|err| format!("未計算の PDQ 件数を取得できません: {}", err))?;
    Ok(count.max(0) as usize)
}

fn fetch_pending_batch() -> Result<Vec<(i64, String, String)>, String> {
    let conn = open_alpheratz_connection(1)?;
    let mut stmt = conn
        .prepare(
            "SELECT source_slot, photo_filename, photo_path
             FROM photos
             WHERE is_missing = 0
               AND (
                 phash IS NULL
                 OR phash = ''
                 OR COALESCE(phash_version, 0) != ?1
               )
             ORDER BY timestamp DESC
             LIMIT ?2",
        )
        .map_err(|err| format!("PDQ 対象クエリを準備できません: {}", err))?;
    let rows = stmt
        .query_map(
            rusqlite::params![PHASH_VERSION, PHASH_BATCH_SIZE as i64],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .map_err(|err| format!("PDQ 対象を読み出せません: {}", err))?;

    let mut batch = Vec::new();
    for row in rows {
        match row {
            Ok(item) => batch.push(item),
            Err(err) => crate::utils::log_warn(&format!("PDQ target row decode failed: {}", err)),
        }
    }
    Ok(batch)
}

fn compute_pdq_batch(batch: Vec<(i64, String, String)>) -> Result<Vec<PdqComputeResult>, String> {
    if batch.is_empty() {
        return Ok(Vec::new());
    }

    let worker_count = PHASH_WORKER_LIMIT.min(batch.len()).max(1);
    let chunk_size = batch.len().div_ceil(worker_count);
    let mut handles = Vec::with_capacity(worker_count);

    for chunk in batch.chunks(chunk_size) {
        let owned_chunk = chunk.to_vec();
        handles.push(thread::spawn(move || {
            owned_chunk
                .into_iter()
                .map(|(source_slot, filename, path)| {
                    match compute_pdq_variants_from_path(&path, source_slot) {
                        Ok(hash) => PdqComputeResult {
                            source_slot,
                            path,
                            filename,
                            hash: Some(hash),
                            error: None,
                        },
                        Err(err) => PdqComputeResult {
                            source_slot,
                            path,
                            filename,
                            hash: None,
                            error: Some(err),
                        },
                    }
                })
                .collect::<Vec<PdqComputeResult>>()
        }));
    }

    let mut results = Vec::with_capacity(batch.len());
    for handle in handles {
        let mut chunk_results = handle
            .join()
            .map_err(|_| "PDQ ワーカースレッドが panic しました".to_string())?;
        results.append(&mut chunk_results);
    }
    Ok(results)
}

fn apply_pdq_updates(conn: &Connection, results: &[PdqComputeResult]) -> Result<(), String> {
    let tx = conn
        .unchecked_transaction()
        .map_err(|err| format!("PDQ 更新トランザクションを開始できません: {}", err))?;

    {
        let mut stmt = tx
            .prepare(
                "UPDATE photos
                 SET phash = ?1,
                     phash_version = ?2
                 WHERE photo_path = ?3
                   AND source_slot = ?4",
            )
            .map_err(|err| format!("PDQ 更新ステートメントを準備できません: {}", err))?;

        for result in results {
            let Some(hash) = &result.hash else {
                continue;
            };

            stmt.execute(rusqlite::params![
                hash,
                PHASH_VERSION,
                result.path,
                result.source_slot
            ])
            .map_err(|err| format!("PDQ を更新できません [{}]: {}", result.path, err))?;
        }
    }

    tx.commit()
        .map_err(|err| format!("PDQ 更新トランザクションを確定できません: {}", err))?;
    Ok(())
}

fn update_progress(app: &AppHandle, done: usize, total: usize, current: Option<String>) {
    let state = app.state::<PHashWorkerState>();
    match state.progress.lock() {
        Ok(mut progress) => {
            progress.done = done;
            progress.total = total;
            progress.current = current;
        }
        Err(err) => {
            crate::utils::log_warn(&format!("PDQ 進捗状態を更新できませんでした: {}", err));
        }
    };
}

fn emit_event<T: Serialize + Clone>(app: &AppHandle, event: &str, payload: T) {
    if let Err(err) = app.emit(event, payload) {
        crate::utils::log_warn(&format!("emit failed [{}]: {}", event, err));
    }
}

fn compute_pdq_variants_from_path(path: &str, source_slot: i64) -> Result<String, String> {
    let thumb_path = utils::create_thumbnail_file(path, source_slot)?;
    let image = image::open(&thumb_path)
        .map_err(|err| format!("PDQ 用サムネイルを開けません [{}]: {}", thumb_path, err))?;
    Ok(compute_pdq_variants(&image)?.join("|"))
}

fn compute_pdq_variants(image: &DynamicImage) -> Result<[String; 4], String> {
    Ok([
        compute_pdq_hash(image)?,
        compute_pdq_hash(&image.rotate90())?,
        compute_pdq_hash(&image.rotate180())?,
        compute_pdq_hash(&image.rotate270())?,
    ])
}

fn compute_pdq_hash(image: &DynamicImage) -> Result<String, String> {
    let Some((hash, _quality)) = generate_pdq(image) else {
        return Err("PDQ ハッシュを計算できませんでした".to_string());
    };
    Ok(hash
        .iter()
        .map(|byte| format!("{:02x}", byte))
        .collect::<String>())
}
