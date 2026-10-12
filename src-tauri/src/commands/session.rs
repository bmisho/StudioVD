//! Session commands (PLAN 5.3, 5.5): dirty state and the close guard, recent projects,
//! autosave and crash recovery.

use super::ipc::{blocking, raw_body};
use crate::error::{AppError, AppResult};
use crate::project::open::{self, PendingInfo};
use crate::project::recent::{self, RecentProject};
use crate::project::save;
use crate::project::window::update_title;
use crate::state::AppState;
use crate::workspace::{recovery, Workspace};
use serde::Serialize;
use tauri::ipc::Request;
use tauri::{AppHandle, Manager, Runtime, State, Window};

/// The webview's unsaved-changes flag: drives the title and the close guard.
#[tauri::command]
pub fn project_set_dirty<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    dirty: bool,
) -> AppResult<()> {
    let mut project = state.project()?;
    project.dirty = dirty;
    update_title(&app, &project);
    Ok(())
}

/// The webview received a close request and is asking the user.
#[tauri::command]
pub fn project_close_ack(state: State<'_, AppState>) -> AppResult<()> {
    state.project()?.close_asked = None;
    Ok(())
}

/// The user chose Save (and it worked) or Don't Save: close for real.
#[tauri::command]
pub fn project_close_confirmed<R: Runtime>(
    window: Window<R>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    state.project()?.dirty = false;
    window.destroy().map_err(|e| AppError::Io(e.to_string()))
}

/// Async: listing stats every path, and a file on an offline share can block for a while.
#[tauri::command]
pub async fn recent_projects<R: Runtime>(app: AppHandle<R>) -> AppResult<Vec<RecentProject>> {
    blocking(move || {
        let state = app.state::<AppState>();
        Ok(state.config_dir().map(recent::list).unwrap_or_default())
    })
    .await
}

#[tauri::command]
pub async fn autosave_write(state: State<'_, AppState>, request: Request<'_>) -> AppResult<()> {
    save::autosave(&state, raw_body(&request)?)
}

/// Async like `autosave_write`, so both run on the same pool (the webview orders them).
#[tauri::command]
pub async fn autosave_clear(state: State<'_, AppState>) -> AppResult<()> {
    save::clear_autosave(&state)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryInfo {
    token: String,
    title: String,
    file_name: Option<String>,
    autosaved_at_ms: u64,
    size_bytes: u64,
}

/// Sessions that ended with unsaved changes (a crash, a kill, a logoff).
#[tauri::command]
pub async fn recovery_list<R: Runtime>(app: AppHandle<R>) -> AppResult<Vec<RecoveryInfo>> {
    blocking(move || {
        let state = app.state::<AppState>();
        let base = state.workspaces_dir()?.to_path_buf();
        let current = state.project()?.workspace()?.root().to_path_buf();
        let found = recovery::candidates(&base, &current);
        let mut project = state.project()?;
        project.recovery.clear();
        Ok(found
            .into_iter()
            .enumerate()
            .map(|(i, c)| {
                let token = format!("r{i}");
                project.recovery.push((token.clone(), c.root));
                RecoveryInfo {
                    token,
                    title: c.title,
                    file_name: c.file_name,
                    autosaved_at_ms: c.autosaved_at_ms,
                    size_bytes: c.size_bytes,
                }
            })
            .collect())
    })
    .await
}

fn recovery_root(state: &AppState, token: &str) -> AppResult<std::path::PathBuf> {
    state
        .project()?
        .recovery
        .iter()
        .find(|(t, _)| t == token)
        .map(|(_, root)| root.clone())
        .ok_or_else(|| AppError::InvalidInput("Unknown recovery entry.".into()))
}

/// Restores a crashed session: it waits for `project_commit` like an opened file.
#[tauri::command]
pub async fn recovery_restore<R: Runtime>(
    app: AppHandle<R>,
    token: String,
) -> AppResult<PendingInfo> {
    blocking(move || {
        let state = app.state::<AppState>();
        let root = recovery_root(&state, &token)?;
        open::restore(&state, root)
    })
    .await
}

#[tauri::command]
pub async fn recovery_discard<R: Runtime>(app: AppHandle<R>, token: String) -> AppResult<()> {
    blocking(move || {
        let state = app.state::<AppState>();
        let root = recovery_root(&state, &token)?;
        Workspace::adopt(&root)?.discard();
        state.project()?.recovery.retain(|(t, _)| *t != token);
        Ok(())
    })
    .await
}
