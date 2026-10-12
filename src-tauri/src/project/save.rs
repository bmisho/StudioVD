//! Save, Save As, New and autosave (PLAN 5.3, 5.5).

use super::session::retire;
use super::{recent, remember_path, ProjectInfo};
use crate::bundle::stvd;
use crate::error::{AppError, AppResult};
use crate::fsutil::write_atomic;
use crate::picked::file_name;
use crate::state::AppState;
use crate::workspace::recovery::MAX_AUTOSAVE_BYTES;
use crate::workspace::Workspace;
use std::fs;
use std::path::PathBuf;

/// Writes the project to `target`, or to its own file when `target` is `None`. The scene
/// (and thumbnail) come from the webview; the files it names come from the workspace.
pub fn save(
    state: &AppState,
    scene: &[u8],
    thumbnail: Option<&[u8]>,
    target: Option<PathBuf>,
) -> AppResult<ProjectInfo> {
    let (bundle, path, generation) = {
        let mut project = state.project()?;
        let bundle = project.workspace()?.bundle_dir();
        let path = target.or_else(|| project.path.clone()).ok_or_else(|| {
            AppError::InvalidInput("The project has no file yet: use Save As.".into())
        })?;
        let generation = project.begin()?;
        (bundle, path, generation)
    };
    // The zip is written without the lock: assets keep loading while a large project saves.
    let written = stvd::write(&bundle, scene, thumbnail, &path)
        .map_err(|e| e.context(&format!("{} could not be saved.", file_name(&path))));
    let mut project = state.project()?;
    if project.generation != generation {
        // The page reloaded meanwhile: the new session is not this file's.
        return written.map(|()| ProjectInfo { file_name: None });
    }
    project.busy = false;
    written?;
    if let Some(png) = thumbnail {
        let _ = write_atomic(&bundle.join(stvd::THUMBNAIL), png); // kept for later saves
    }
    let ws = project.workspace()?;
    let _ = fs::remove_file(ws.autosave_path()); // everything unsaved is in the file now
    remember_path(ws, Some(&path));
    if let Some(config) = state.config_dir() {
        recent::add(config, &path);
    }
    project.path = Some(path);
    Ok(project.info())
}

/// A fresh, untitled project in a new workspace (New, Close).
pub fn new_project(state: &AppState) -> AppResult<ProjectInfo> {
    let ws = Workspace::create(state.workspaces_dir()?)?;
    let mut project = state.project()?;
    if project.busy {
        drop(project);
        ws.discard();
        return Err(AppError::InvalidInput(
            "Another project operation is still running.".into(),
        ));
    }
    let old = project.install(ws, None);
    let info = project.info();
    drop(project);
    if let Some(old) = old {
        retire(old, false); // its changes were saved or discarded first
    }
    Ok(info)
}

/// Stores the webview's unsaved scene in the workspace, for crash recovery.
pub fn autosave(state: &AppState, scene: &[u8]) -> AppResult<()> {
    if scene.len() as u64 > MAX_AUTOSAVE_BYTES {
        return Err(AppError::InvalidInput(
            "The project is too large to autosave.".into(),
        ));
    }
    serde_json::from_slice::<serde::de::IgnoredAny>(scene)
        .map_err(|e| AppError::InvalidInput(format!("The autosave is not JSON: {e}")))?;
    let path = state.project()?.workspace()?.autosave_path();
    write_atomic(&path, scene)
}

/// Unsaved changes are gone (saved elsewhere, undone, or the user chose Don't Save).
pub fn clear_autosave(state: &AppState) -> AppResult<()> {
    let path = state.project()?.workspace()?.autosave_path();
    match fs::remove_file(path) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
        _ => Ok(()),
    }
}
