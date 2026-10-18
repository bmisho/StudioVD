//! Opening a `.stvd` or restoring a crashed session: extract or adopt into a pending
//! workspace, let the webview validate the scene, then commit or discard.

use super::file::{changed_since, file_stamp, same_path};
use super::session::retire;
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
    /// The file the project already has open (reopening it reverts to what is on disk).
    pub same_file: bool,
}

/// Parks `pending`, replacing (and dropping) any earlier one.
fn park(state: &AppState, pending: Pending) -> AppResult<()> {
    let old = state.project()?.pending.replace(pending);
    if let Some(old) = old {
        retire(old.workspace, true);
    }
    Ok(())
}

/// Extracts the `.stvd` at `path` into a fresh workspace, every guard check included.
pub fn load(state: &AppState, path: PathBuf) -> AppResult<PendingInfo> {
    let name = file_name(&path);
    let stamp = file_stamp(&path); // before extracting: a write during it counts too
    let ws = Workspace::create_empty(state.workspaces_dir()?)?;
    let files = match stvd::extract(&path, &ws.bundle_dir()) {
        Ok(files) => files,
        Err(e) => {
            ws.discard();
            return Err(e.context(&format!("{name} could not be opened.")));
        }
    };
    let scene = ws.bundle_dir().join(stvd::SCENE);
    // Compared outside the lock: the open file may sit on a share that is slow or gone.
    let open = state.project()?.path.clone();
    let same_file = open.is_some_and(|open| same_path(&open, &path));
    park(
        state,
        Pending {
            workspace: ws,
            path: Some(path),
            scene,
            stamp,
        },
    )?;
    Ok(PendingInfo {
        file_name: Some(name),
        files,
        recovered: false,
        same_file,
    })
}

/// Takes over a crashed session's workspace (see `workspace::recovery`).
pub fn restore(state: &AppState, root: PathBuf) -> AppResult<PendingInfo> {
    let ws = Workspace::adopt(&root)?;
    let path = recovery::project_path(&root);
    let bundle = ws.bundle_dir();
    let files = ["geometry", "textures"]
        .iter()
        .flat_map(|dir| {
            fs::read_dir(bundle.join(dir))
                .map(|entries| {
                    entries
                        .flatten()
                        .map(|e| format!("{dir}/{}", e.file_name().to_string_lossy()))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default()
        })
        .collect();
    let scene = ws.autosave_path();
    let file_name = path.as_deref().map(file_name);
    park(
        state,
        Pending {
            workspace: ws,
            path,
            scene,
            stamp: None,
        },
    )?;
    Ok(PendingInfo {
        file_name,
        files,
        recovered: true,
        same_file: false,
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
    let (pending, generation) = {
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
        (pending, project.generation)
    };
    // File checks run outside the lock: the file may sit on a share that is slow or gone.
    if let (Some(path), Some(stamp)) = (&pending.path, pending.stamp) {
        // Saved over (by Save As, or another program) after it was extracted: the extraction
        // is out of date. The webview drops the open and reports this.
        if changed_since(path, stamp) {
            let name = file_name(path);
            retire(pending.workspace, false);
            return Err(AppError::InvalidInput(format!(
                "{name} changed while it was being opened. Open it again."
            )));
        }
    }
    let recovered = pending.scene == pending.workspace.autosave_path();
    if !recovered {
        remember_path(&pending.workspace, pending.path.as_deref());
    }
    let path = pending.path.clone();
    let mut project = state.project()?;
    if project.generation != generation {
        // The page reloaded meanwhile: this open belonged to the old page.
        drop(project);
        retire(pending.workspace, true);
        return Err(AppError::InvalidInput("The window was reloaded.".into()));
    }
    let old = project.install(pending.workspace, pending.path);
    project.dirty = recovered;
    let info = project.info();
    drop(project);
    if let (Some(path), Some(config)) = (&path, state.config_dir()) {
        recent::add(config, path);
    }
    if let Some(old) = old {
        retire(old, false); // its changes were saved or discarded before this open
    }
    Ok(info)
}

/// The webview refused the pending scene (or the user cancelled): drop it. A recovered
/// session keeps its autosave, so it is offered again next time.
pub fn discard(state: &AppState) -> AppResult<()> {
    let pending = state.project()?.pending.take();
    if let Some(pending) = pending {
        retire(pending.workspace, true);
    }
    Ok(())
}
