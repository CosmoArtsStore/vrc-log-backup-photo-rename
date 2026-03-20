use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::db::open_alpheratz_connection;

const ORIENTATION_BATCH_SIZE: usize = 200;

pub struct OrientationWorkerState {
    pub running: AtomicBool,
    pub progress: Mutex<OrientationProgressPayload>,
}

#[derive(Clone, Debug, Serialize, Default)]
pub struct OrientationProgressPayload {
    pub done: usize,
    pub total: usize,
    pub current: Option<String>,
}

pub fn start_orientation_worker(app: AppHandle) {
    let state = app.state::<OrientationWorkerState>();
    if state.running.swap(true, Ordering::SeqCst) {
        return;
    }

    tauri::async_runtime::spawn(async move {
        if let Err(err) = run_orientation_worker(app.clone()).await {
            crate::utils::log_err(&format!("orientation worker failed: {}", err));
        }

        let state = app.state::<OrientationWorkerState>();
        state.running.store(false, Ordering::SeqCst);
        if let Ok(mut progress) = state.progress.lock() {
            progress.current = None;
        }
        emit_event(&app, "orientation_complete", ());
    });
}

pub fn get_orientation_progress(app: &AppHandle) -> OrientationProgressPayload {
    let state = app.state::<OrientationWorkerState>();
    let progress = match state.progress.lock() {
        Ok(progress) => progress.clone(),
        Err(err) => {
            crate::utils::log_warn(&format!("縦横進捗状態を読み取れませんでした: {}", err));
            OrientationProgressPayload::default()
        }
    };
    progress
}

pub fn has_pending_orientation() -> Result<bool, String> {
    let conn = open_alpheratz_connection(1)?;
    let count = conn
        .query_row(
            "SELECT COUNT(*) FROM photos
             WHERE is_missing = 0
               AND (
                 orientation IS NULL OR orientation = ''
                 OR image_width IS NULL
                 OR image_height IS NULL
               )",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|err| format!("未解析の縦横件数を取得できません: {}", err))?;
    Ok(count > 0)
}

async fn run_orientation_worker(app: AppHandle) -> Result<(), String> {
    let total = tauri::async_runtime::spawn_blocking(|| count_pending_orientation(1))
        .await
        .map_err(|err| format!("縦横件数確認タスクの待機に失敗しました: {}", err))??;

    update_progress(&app, 0, total, None);
    emit_event(&app, "orientation_progress", get_orientation_progress(&app));

    if total == 0 {
        return Ok(());
    }

    let mut done = 0usize;

    loop {
        let batch = tauri::async_runtime::spawn_blocking(fetch_pending_orientation_batch)
            .await
            .map_err(|err| format!("縦横対象取得タスクの待機に失敗しました: {}", err))??;

        if batch.is_empty() {
            break;
        }

        for (source_slot, filename, path) in batch {
            let current_path = path.clone();
            let filename_for_progress = filename.clone();
            let result = tauri::async_runtime::spawn_blocking(move || {
                let dimensions = read_image_dimensions(Path::new(&current_path))?;
                let orientation = infer_orientation_from_dimensions(dimensions);
                let (image_width, image_height) =
                    (i64::from(dimensions.0), i64::from(dimensions.1));
                let conn = open_alpheratz_connection(source_slot)?;
                conn.execute(
                    "UPDATE photos
                     SET orientation = ?1, image_width = ?2, image_height = ?3
                     WHERE photo_path = ?4",
                    rusqlite::params![orientation, image_width, image_height, current_path],
                )
                .map_err(|err| {
                    format!(
                        "縦横情報を保存できません [{}]: {}",
                        filename_for_progress, err
                    )
                })?;
                Ok::<(), String>(())
            })
            .await
            .map_err(|err| format!("縦横解析タスクの待機に失敗しました [{}]: {}", filename, err))?;

            if let Err(err) = result {
                crate::utils::log_warn(&format!("orientation skipped [{}]: {}", filename, err));
            }

            done += 1;
            update_progress(&app, done, total, Some(filename.clone()));
            emit_event(&app, "orientation_progress", get_orientation_progress(&app));
        }
    }

    Ok(())
}

fn count_pending_orientation(source_slot: i64) -> Result<usize, String> {
    let conn = open_alpheratz_connection(source_slot)?;
    let count = conn
        .query_row(
            "SELECT COUNT(*) FROM photos
             WHERE is_missing = 0
               AND (
                 orientation IS NULL OR orientation = ''
                 OR image_width IS NULL
                 OR image_height IS NULL
               )",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|err| format!("未解析の縦横件数を取得できません: {}", err))?;
    Ok(count.max(0) as usize)
}

fn fetch_pending_orientation_batch() -> Result<Vec<(i64, String, String)>, String> {
    let conn = open_alpheratz_connection(1)?;
    let mut stmt = conn
        .prepare(
            "SELECT source_slot, photo_filename, photo_path
             FROM photos
             WHERE is_missing = 0
               AND (
                 orientation IS NULL OR orientation = ''
                 OR image_width IS NULL
                 OR image_height IS NULL
               )
             ORDER BY timestamp DESC
             LIMIT ?1",
        )
        .map_err(|err| format!("縦横対象クエリを準備できません: {}", err))?;
    let rows = stmt
        .query_map([ORIENTATION_BATCH_SIZE as i64], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|err| format!("縦横対象クエリを実行できません: {}", err))?;

    let mut batch = Vec::new();
    for row in rows {
        match row {
            Ok(item) => batch.push(item),
            Err(err) => {
                crate::utils::log_warn(&format!("orientation target row decode failed: {}", err))
            }
        }
    }
    Ok(batch)
}

fn infer_orientation_from_dimensions(dimensions: (u32, u32)) -> Option<String> {
    let (width, height) = dimensions;
    Some(
        if height > width {
            "portrait"
        } else {
            "landscape"
        }
        .to_string(),
    )
}

fn read_image_dimensions(path: &Path) -> Result<(u32, u32), String> {
    image::image_dimensions(path).map_err(|err| {
        format!(
            "画像サイズを取得できません。縦横解析をスキップします [{}]: {}",
            path.display(),
            err
        )
    })
}

fn update_progress(app: &AppHandle, done: usize, total: usize, current: Option<String>) {
    let state = app.state::<OrientationWorkerState>();
    match state.progress.lock() {
        Ok(mut progress) => {
            progress.done = done;
            progress.total = total;
            progress.current = current;
        }
        Err(err) => {
            crate::utils::log_warn(&format!("縦横進捗状態を更新できませんでした: {}", err));
        }
    };
}

fn emit_event<T: Serialize + Clone>(app: &AppHandle, event: &str, payload: T) {
    if let Err(err) = app.emit(event, payload) {
        crate::utils::log_warn(&format!("emit failed [{}]: {}", event, err));
    }
}
