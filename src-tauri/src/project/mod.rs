//! The open project (PLAN 5.3): the workspace the webview edits, the `.stvd` it belongs to,
//! and an open in progress. Paths stay here: the webview sees file names only (CLAUDE.md §9).
//!
//! Opening is two-step so a bad file never replaces the current project: Rust extracts the
//! bundle into a fresh workspace (`Pending`), the webview validates its scene.json, and only
//! then `commit` swaps it in (or `discard` drops it).

pub mod launch;
pub mod open;
pub mod recent;
pub mod save;
pub mod window;

use crate::error::{AppError, AppResult};
use crate::picked::file_name;
use crate::workspace::{recovery, Workspace};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Instant;

/// What the webview knows about the open project.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    /// `None` for a project never saved.
    pub file_name: Option<String>,
}

/// A bundle extracted and waiting for the webview's verdict.
pub struct Pending {
    pub workspace: Workspace,
    pub path: Option<PathBuf>,
    /// The scene to validate: `bundle/scene.json`, or the autosave of a recovered session.
    pub scene: PathBuf,
}

#[derive(Default)]
pub struct Project {
    pub workspace: Option<Workspace>,
    pub path: Option<PathBuf>,
    pub dirty: bool,
    /// Set while a save runs outside the lock: one project operation at a time.
    pub busy: bool,
    pub pending: Option<Pending>,
    /// A `.stvd` from the command line, a second launch or a drop, until the webview takes it.
    pub launch: Option<PathBuf>,
    /// Recovery candidates handed out, by token.
    pub recovery: Vec<(String, PathBuf)>,
    /// When the webview was last asked to confirm closing (cleared when it answers).
    pub close_asked: Option<Instant>,
}

impl Project {
    pub fn info(&self) -> ProjectInfo {
        ProjectInfo {
            file_name: self.path.as_deref().map(file_name),
        }
    }

    pub fn workspace(&self) -> AppResult<&Workspace> {
        self.workspace
            .as_ref()
            .ok_or_else(|| AppError::Io("The project workspace could not be created.".into()))
    }

    pub fn begin(&mut self) -> AppResult<()> {
        if self.busy {
            return Err(AppError::InvalidInput(
                "Another project operation is still running.".into(),
            ));
        }
        self.busy = true;
        Ok(())
    }

    /// Makes `workspace` the project's and returns the old one, to `release` outside the lock
    /// (deleting a large workspace takes a while).
    pub fn install(&mut self, workspace: Workspace, path: Option<PathBuf>) -> Option<Workspace> {
        let old = self.workspace.replace(workspace);
        self.path = path;
        self.dirty = false;
        old
    }
}

/// Records which `.stvd` a workspace belongs to, for crash recovery. Best effort: a missing
/// manifest only means a recovered session comes back untitled.
pub fn remember_path(ws: &Workspace, path: Option<&Path>) {
    if let Err(e) = recovery::write_manifest(ws, path) {
        eprintln!("StudioVD: workspace manifest not written ({e}).");
    }
}
