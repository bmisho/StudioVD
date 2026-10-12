//! Opening a `.stvd` or restoring a crashed session: extract or adopt into a pending
//! workspace, let the webview validate the scene, then commit or discard.

use super::{recent, remember_path, Pending, ProjectInfo};
use crate::bundle::stvd;
use crate::error::{AppError, AppResult};
use crate::picked::file_name;
use crate::state::AppState;
use crate::workspace::{recovery, Workspace};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;

/// What the webview learns about a pending open.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PendingInfo {
    pub file_name: Option<String>,
    /// Bundle entries, so the webview can check every file its scene names is there.
    pub files: Vec<String>,
    /// A crashed session's unsaved work: it opens with unsaved changes.
    pub recovered: bool,
}

/// Parks `pending`, replacing (and dropping) any earlier one.
fn park(state: &AppState, pending: Pending) -> AppResult<()> {
    let old = state.project()?.pending.replace(pending);
    if let Some(old) = old {
        old.workspace.release();
    }
    Ok(())
}

/// Extracts the `.stvd` at `path` into a fresh workspace, every guard check included.
pub fn load(state: &AppState, path: PathBuf) -> AppResult<PendingInfo> {
    let name = file_name(&path);
    let ws = Workspace::create_empty(state.workspaces_dir()?)?;
    let files = match stvd::extract(&path, &ws.bundle_dir()) {
        Ok(files) => files,
        Err(e) => {
            ws.discard();
            return Err(e.context(&format!("{name} could not be opened.")));
        }
    };
    let scene = ws.bundle_dir().join(stvd::SCENE);
    park(
        state,
        Pending {
            workspace: ws,
            path: Some(path),
            scene,
        },
    )?;
    Ok(PendingInfo {
        file_name: Some(name),
        files,
        recovered: false,
    })
}

/// Takes over a crashed session's workspace (see `workspace::recovery`).
pub fn restore(state: &AppState, root: PathBuf) -> AppResult<PendingInfo> {
    let ws = Workspace::adopt(&root)?;
    let path = recovery::project_path(&root);
    let geometry = ws.geometry_dir();
    let files = fs::read_dir(&geometry)
        .map(|entries| {
            entries
                .flatten()
                .map(|e| format!("geometry/{}", e.file_name().to_string_lossy()))
                .collect()
        })
        .unwrap_or_default();
    let scene = ws.autosave_path();
    let file_name = path.as_deref().map(file_name);
    park(
        state,
        Pending {
            workspace: ws,
            path,
            scene,
        },
    )?;
    Ok(PendingInfo {
        file_name,
        files,
        recovered: true,
    })
}

/// The pending scene's bytes (capped like every scene.json).
pub fn scene(state: &AppState) -> AppResult<Vec<u8>> {
    let path = state
        .project()?
        .pending
        .as_ref()
        .map(|p| p.scene.clone())
        .ok_or_else(|| AppError::InvalidInput("Nothing is being opened.".into()))?;
    if fs::metadata(&path)?.len() > stvd::MAX_SCENE_BYTES {
        return Err(AppError::InvalidInput("scene.json is too large.".into()));
    }
    Ok(fs::read(path)?)
}

/// The webview accepted the pending scene: it becomes the project.
pub fn commit(state: &AppState) -> AppResult<ProjectInfo> {
    let mut project = state.project()?;
    if project.busy {
        return Err(AppError::InvalidInput(
            "Another project operation is still running.".into(),
        ));
    }
    let pending = project
        .pending
        .take()
        .ok_or_else(|| AppError::InvalidInput("Nothing is being opened.".into()))?;
    let recovered = pending.scene == pending.workspace.autosave_path();
    if !recovered {
        remember_path(&pending.workspace, pending.path.as_deref());
    }
    if let (Some(path), Some(config)) = (&pending.path, state.config_dir()) {
        recent::add(config, path);
    }
    let old = project.install(pending.workspace, pending.path);
    project.dirty = recovered;
    let info = project.info();
    drop(project);
    if let Some(old) = old {
        old.release();
    }
    Ok(info)
}

/// The webview refused the pending scene (or the user cancelled): drop it. A recovered
/// session keeps its autosave, so it is offered again next time.
pub fn discard(state: &AppState) -> AppResult<()> {
    let pending = state.project()?.pending.take();
    if let Some(pending) = pending {
        pending.workspace.release();
    }
    Ok(())
}
