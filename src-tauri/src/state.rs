//! Process-wide backend state: the current workspace and the files the user picked.

use crate::error::{AppError, AppResult};
use crate::picked::PickedFiles;
use crate::workspace::{clean_stale, Workspace};
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime};

/// Workspaces left behind by a crash are deleted after this long.
const STALE_WORKSPACE_AGE: Duration = Duration::from_secs(14 * 24 * 60 * 60);

pub struct AppState {
    workspace: Option<Workspace>,
    picked: Mutex<PickedFiles>,
}

impl AppState {
    /// Creates this session's workspace and opens the asset protocol to its geometry folder
    /// only. A failure is logged, not fatal: the app starts and imports report the error.
    pub fn new<R: Runtime>(app: &AppHandle<R>) -> Self {
        let workspace = open_workspace(app)
            .inspect_err(|e| eprintln!("StudioVD: no workspace ({e}); importing is disabled."))
            .ok();
        Self {
            workspace,
            picked: Mutex::new(PickedFiles::default()),
        }
    }

    pub fn workspace(&self) -> AppResult<&Workspace> {
        self.workspace
            .as_ref()
            .ok_or_else(|| AppError::Io("The project workspace could not be created.".into()))
    }

    pub fn picked(&self) -> AppResult<MutexGuard<'_, PickedFiles>> {
        self.picked
            .lock()
            .map_err(|_| AppError::Io("The file list is unavailable.".into()))
    }

    /// Deletes this session's workspace (on exit; Phase 5 keeps saved work in the `.stvd`).
    pub fn remove_workspace(&self) {
        if let Some(ws) = &self.workspace {
            let _ = std::fs::remove_dir_all(ws.root());
        }
    }
}

fn open_workspace<R: Runtime>(app: &AppHandle<R>) -> AppResult<Workspace> {
    let base = app
        .path()
        .app_cache_dir()
        .map_err(|e| AppError::Io(e.to_string()))?
        .join("workspaces");
    let ws = Workspace::create(&base)?;
    clean_stale(&base, STALE_WORKSPACE_AGE, ws.root());
    // The scope matches canonical request paths, so allow the canonical folder too (symlinked
    // cache dirs on Linux, `\\?\` paths on Windows).
    let scope = app.asset_protocol_scope();
    let dir = ws.geometry_dir();
    let canonical = dir.canonicalize()?;
    for allowed in [&dir, &canonical] {
        scope
            .allow_directory(allowed, false)
            .map_err(|e| AppError::Io(e.to_string()))?;
    }
    Ok(ws)
}
