//! The online catalog (PLAN 14.3, 14.5): its status from the cache (no network); Refresh and
//! Download only on an explicit action. A downloaded pack is staged like Install from file,
//! as Official, for the webview to validate and commit. Commands take pack ids, never URLs.

use super::ipc::blocking;
use super::online::{client, hosts, load_settings, now_secs, update_settings};
use crate::error::{AppError, AppResult};
use crate::library::install::{stage_pack_as, StagedSummary};
use crate::library::online::catalog::{fetch_pack, refresh, Ctx};
use crate::library::online::{cache, source::OFFICIAL, trust::Trust};
use crate::library::{commit::cancel, Library};
use crate::state::AppState;
use crate::workspace::is_asset_id;
use serde::Serialize;
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Runtime};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogStatus {
    pub configured: bool,
    pub hosts: Vec<String>,
    pub offline: bool,
    pub consented: bool,
    /// The verified index text, for the webview's validation; None before a first refresh.
    pub index: Option<String>,
    pub fetched_at: Option<u64>,
    pub expired: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogRefresh {
    pub status: CatalogStatus,
    pub changed: bool,
    pub previews_failed: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub done: u64,
    pub total: u64,
}

fn library<R: Runtime>(app: &AppHandle<R>) -> AppResult<Arc<Library>> {
    app.state::<AppState>().library()
}

fn status<R: Runtime>(app: &AppHandle<R>) -> AppResult<CatalogStatus> {
    let settings = load_settings(app)?;
    let lib = library(app)?;
    let cached = cache::load(&lib, &OFFICIAL);
    Ok(CatalogStatus {
        configured: OFFICIAL.configured(),
        hosts: hosts(&settings),
        offline: settings.offline,
        consented: settings.consented,
        expired: cached.as_ref().is_some_and(|c| c.expired(now_secs())),
        fetched_at: cached.as_ref().map(|c| c.fetched_at),
        index: cached.and_then(|c| String::from_utf8(c.index).ok()),
    })
}

#[tauri::command]
pub async fn catalog_status<R: Runtime>(app: AppHandle<R>) -> AppResult<CatalogStatus> {
    blocking(move || status(&app)).await
}

async fn run_refresh<R: Runtime>(app: &AppHandle<R>) -> AppResult<(bool, usize)> {
    let settings = load_settings(app)?;
    let client = client(app, &settings)?;
    let lib = library(app)?;
    let state = app.state::<AppState>();
    let job = state.downloads().begin("index")?;
    let ctx = Ctx {
        lib: &lib,
        source: &OFFICIAL,
        client: &client,
        mirror: settings.mirror.as_deref(),
        cancel: &job.cancel,
        now: now_secs(),
        app_version: env!("CARGO_PKG_VERSION"),
    };
    let done = refresh(&ctx).await?;
    let now = ctx.now;
    update_settings(app, |s| s.last_check = Some(now))?;
    Ok((done.changed, done.previews_failed))
}

/// Refresh: the index (and its thumbnails) from the catalog's hosts, verified and cached.
#[tauri::command]
pub async fn catalog_refresh<R: Runtime>(app: AppHandle<R>) -> AppResult<CatalogRefresh> {
    let (changed, previews_failed) = run_refresh(&app).await?;
    Ok(CatalogRefresh {
        status: blocking(move || status(&app)).await?,
        changed,
        previews_failed,
    })
}

/// Download: one pack the cached index lists (refreshed first when it has expired), checked
/// and staged. Progress goes to `on_progress` at most every 100 ms.
#[tauri::command]
pub async fn catalog_download<R: Runtime>(
    app: AppHandle<R>,
    pack: String,
    on_progress: Channel<DownloadProgress>,
) -> AppResult<StagedSummary> {
    if !is_asset_id(&pack) {
        return Err(AppError::InvalidInput("That is not a pack id.".into()));
    }
    let lib = library(&app)?;
    let stale = cache::load(&lib, &OFFICIAL).is_none_or(|c| c.expired(now_secs()));
    if stale {
        run_refresh(&app).await?; // no installs from an expired index (freeze guard)
    }
    let cached = cache::load(&lib, &OFFICIAL)
        .ok_or_else(|| AppError::InvalidInput("Refresh the catalog first.".into()))?;
    let settings = load_settings(&app)?;
    let client = client(&app, &settings)?;
    let state = app.state::<AppState>();
    let job = state.downloads().begin(&pack)?;
    let _slot = state.downloads().slot(&job).await?;
    let ctx = Ctx {
        lib: &lib,
        source: &OFFICIAL,
        client: &client,
        mirror: settings.mirror.as_deref(),
        cancel: &job.cancel,
        now: now_secs(),
        app_version: env!("CARGO_PKG_VERSION"),
    };
    let mut report = |done, total| {
        let _ = on_progress.send(DownloadProgress { done, total });
    };
    let path = fetch_pack(&ctx, &cached.meta, &pack, &mut report).await?;
    let (app2, lib2) = (app.clone(), lib.clone());
    blocking(move || {
        let trust = Trust::Catalog {
            meta: &cached.meta,
            pack: &pack,
        };
        let staged = stage_pack_as(&lib2, &path, &trust);
        let _ = std::fs::remove_file(&path);
        let (staged, summary) = staged?;
        for gone in app2.state::<AppState>().staged()?.put(staged) {
            cancel(gone);
        }
        Ok(summary)
    })
    .await
}

#[tauri::command]
pub fn catalog_cancel<R: Runtime>(app: AppHandle<R>, pack: String) -> bool {
    app.state::<AppState>().downloads().cancel(&pack)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskUsage {
    /// Installed components' blobs.
    pub store: u64,
    /// Catalog indexes and thumbnails.
    pub catalogs: u64,
    /// Unfinished downloads.
    pub downloads: u64,
}

fn folder_bytes(dir: &std::path::Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    entries
        .flatten()
        .map(|e| match e.file_type() {
            Ok(t) if t.is_dir() => folder_bytes(&e.path()),
            Ok(t) if t.is_file() => e.metadata().map(|m| m.len()).unwrap_or(0),
            _ => 0,
        })
        .sum()
}

#[tauri::command]
pub async fn library_disk_usage<R: Runtime>(app: AppHandle<R>) -> AppResult<DiskUsage> {
    blocking(move || {
        let lib = library(&app)?;
        Ok(DiskUsage {
            store: folder_bytes(&lib.store_dir()),
            catalogs: folder_bytes(&lib.root().join("catalogs")),
            downloads: folder_bytes(&lib.downloads_dir()),
        })
    })
    .await
}
