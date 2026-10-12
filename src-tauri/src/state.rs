//! Process-wide backend state: the open project and the files the user picked.

use crate::error::{AppError, AppResult};
use crate::picked::PickedFiles;
use crate::project::Project;
use crate::workspace::sweep::{clean_stale, LEFTOVER_AGE, RECOVERABLE_AGE};
use crate::workspace::Workspace;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use tauri::{AppHandle, Manager, Runtime};

pub struct AppState {
    /// `<app cache>/workspaces`, where every project workspace lives.
    workspaces: Option<PathBuf>,
    /// `<app config>`: recent projects.
    config: Option<PathBuf>,
    project: Mutex<Project>,
    picked: Mutex<PickedFiles>,
}

impl AppState {
    /// Creates this session's workspace. A failure is logged, not fatal: the app starts and
    /// project commands report the error.
    pub fn new<R: Runtime>(app: &AppHandle<R>) -> Self {
        let workspaces = app
            .path()
            .app_cache_dir()
            .map(|dir| dir.join("workspaces"))
            .ok();
        let workspace = workspaces.as_deref().and_then(|base| {
            Workspace::create(base)
                .inspect_err(|e| eprintln!("StudioVD: no workspace ({e})."))
                .ok()
        });
        if let (Some(base), Some(ws)) = (&workspaces, &workspace) {
            // Off the startup path: deleting a large leftover workspace takes a while.
            let (base, keep) = (base.clone(), ws.root().to_path_buf());
            std::thread::spawn(move || clean_stale(&base, &keep, LEFTOVER_AGE, RECOVERABLE_AGE));
        }
        Self {
            workspaces,
            config: app.path().app_config_dir().ok(),
            project: Mutex::new(Project {
                workspace,
                ..Project::default()
            }),
            picked: Mutex::new(PickedFiles::default()),
        }
    }

    pub fn project(&self) -> AppResult<MutexGuard<'_, Project>> {
        self.project
            .lock()
            .map_err(|_| AppError::Io("The project state is unavailable.".into()))
    }

    pub fn picked(&self) -> AppResult<MutexGuard<'_, PickedFiles>> {
        self.picked
            .lock()
            .map_err(|_| AppError::Io("The file list is unavailable.".into()))
    }

    pub fn workspaces_dir(&self) -> AppResult<&Path> {
        self.workspaces
            .as_deref()
            .ok_or_else(|| AppError::Io("The app cache folder is unavailable.".into()))
    }

    pub fn config_dir(&self) -> Option<&Path> {
        self.config.as_deref()
    }

    /// Where the `stvd` scheme serves geometry from (the current workspace).
    pub fn geometry_dir(&self) -> Option<PathBuf> {
        let project = self.project().ok()?;
        project.workspace.as_ref().map(Workspace::geometry_dir)
    }

    /// On exit: releases the workspaces. Unsaved changes stay for crash recovery.
    pub fn shutdown(&self) {
        let Ok(mut project) = self.project() else {
            return;
        };
        let pending = project.pending.take();
        let workspace = project.workspace.take();
        drop(project);
        if let Some(pending) = pending {
            pending.workspace.release();
        }
        if let Some(ws) = workspace {
            ws.release();
        }
    }
}
