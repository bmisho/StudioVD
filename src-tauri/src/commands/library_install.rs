//! Install from file (PLAN 9.2): stage a picked pack, then commit it once the webview has
//! validated every manifest and the user confirmed; or drop it. Catalog downloads
//! (`catalog.rs`) commit through the same two commands.

use super::ipc::{blocking, into_path};
use super::library::{entries, now_secs, LibraryEntry};
use crate::error::{AppError, AppResult};
use crate::library::commit::{cancel, commit};
use crate::library::install::{hash_file, stage_pack, stage_pack_as, Staged, StagedSummary};
use crate::library::online::{cache, source::OFFICIAL, trust::Trust};
use crate::library::Library;
use crate::state::AppState;
use tauri::{AppHandle, Manager, Runtime, Window};
use tauri_plugin_dialog::DialogExt;

/// Install from file: a pack the cached, verified catalog lists (downloaded in a browser on a
/// network StudioVD cannot reach through) installs as Official; anything else as Unverified.
fn stage_from_file(lib: &Library, path: &std::path::Path) -> AppResult<(Staged, StagedSummary)> {
    if let Some(cached) = cache::load(lib, &OFFICIAL) {
        let sha = hash_file(path)?;
        if cached.meta.packs.contains_key(&sha) {
            let trust = Trust::Catalog {
                meta: &cached.meta,
                pack: &sha,
            };
            return stage_pack_as(lib, path, &trust);
        }
    }
    stage_pack(lib, path)
}

/// Library › Install from file: a `.stvdpack` through a dialog, extracted and checked into
/// staging. `None` when cancelled. One install waits at a time: a new one replaces it.
#[tauri::command]
pub async fn library_pick_pack<R: Runtime>(
    window: Window<R>,
    app: AppHandle<R>,
) -> AppResult<Option<StagedSummary>> {
    let Some(file) = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Install components from a pack")
        .add_filter("StudioVD packs", &["stvdpack", "STVDPACK"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = into_path(file)?;
    blocking(move || {
        let state = app.state::<AppState>();
        let lib = state.library()?;
        let (staged, summary) = stage_from_file(&lib, &path)?;
        for gone in state.staged()?.put(staged) {
            cancel(gone);
        }
        Ok(Some(summary))
    })
    .await
}

#[tauri::command]
pub async fn library_install_commit<R: Runtime>(
    app: AppHandle<R>,
    token: String,
) -> AppResult<Vec<LibraryEntry>> {
    blocking(move || {
        let state = app.state::<AppState>();
        let lib = state.library()?;
        let staged = state.staged()?.take(&token);
        let staged = staged
            .ok_or_else(|| AppError::InvalidInput("Nothing is waiting to be installed.".into()))?;
        Ok(entries(&lib, commit(&lib, staged, now_secs())?))
    })
    .await
}

#[tauri::command]
pub async fn library_install_cancel<R: Runtime>(app: AppHandle<R>, token: String) -> AppResult<()> {
    blocking(move || {
        if let Some(staged) = app.state::<AppState>().staged()?.take(&token) {
            cancel(staged);
        }
        Ok(())
    })
    .await
}
