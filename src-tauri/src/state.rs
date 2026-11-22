//! Process-wide backend state: the open project and the files the user picked.

use crate::error::{AppError, AppResult};
use crate::library::online::jobs::Downloads;
use crate::library::staged::StagedSet;
use crate::library::Library;
use crate::picked::PickedFiles;
use crate::project::Project;
use crate::workspace::sweep::{clean_stale, LEFTOVER_AGE, RECOVERABLE_AGE};
use crate::workspace::Workspace;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use tauri::{AppHandle, Manager, Runtime};

pub struct AppState {
    /// `<app cache>/workspaces`, where every project workspace lives.
    workspaces: Option<PathBuf>,
    /// `<app cache>/colliders`: convex decompositions by the SHA-256 of their input mesh.
    colliders: Option<PathBuf>,
    /// `<app config>`: recent projects.
    config: Option<PathBuf>,
    project: Mutex<Project>,
    picked: Mutex<PickedFiles>,
    /// `<app local data>/library` (PLAN 4.5), opened at startup.
    library: Option<Arc<Library>>,
    /// Packs extracted (Install from file, catalog downloads), waiting to be committed.
    staged: Mutex<StagedSet>,
    /// `<app local data>`: network settings and the extra CA (Phase 14).
    local_data: Option<PathBuf>,
    downloads: Downloads,
    /// Held while the network settings are read and written.
    network: Mutex<()>,
}

impl AppState {
    /// Creates this session's workspace. A failure is logged, not fatal: the app starts and
    /// project commands report the error.
    pub fn new<R: Runtime>(app: &AppHandle<R>) -> Self {
        let cache = app.path().app_cache_dir().ok();
        let workspaces = cache.as_ref().map(|dir| dir.join("workspaces"));
        let colliders = cache.as_ref().map(|dir| dir.join("colliders"));
        let workspace = workspaces.as_deref().and_then(|base| {
            Workspace::create(base)
                .inspect_err(|e| log::warn!("no workspace ({e})."))
                .ok()
        });
        if let (Some(base), Some(ws)) = (&workspaces, &workspace) {
            // Off the startup path: deleting a large leftover workspace takes a while.
            let (base, keep) = (base.clone(), ws.root().to_path_buf());
            std::thread::spawn(move || clean_stale(&base, &keep, LEFTOVER_AGE, RECOVERABLE_AGE));
        }
        let local_data = app.path().app_local_data_dir().ok();
        let library = local_data.as_ref().and_then(|dir| {
            Library::open(&dir.join("library"))
                .inspect_err(|e| log::warn!("no component library ({e})."))
                .ok()
                .map(Arc::new)
        });
        Self {
            workspaces,
            colliders,
            library,
            staged: Mutex::new(StagedSet::default()),
            local_data,
            downloads: Downloads::default(),
            network: Mutex::new(()),
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

    pub fn library(&self) -> AppResult<Arc<Library>> {
        self.library
            .clone()
            .ok_or_else(|| AppError::Io("The component library folder is unavailable.".into()))
    }

    pub fn staged(&self) -> AppResult<MutexGuard<'_, StagedSet>> {
        self.staged
            .lock()
            .map_err(|_| AppError::Io("The install in progress is unavailable.".into()))
    }

    pub fn downloads(&self) -> &Downloads {
        &self.downloads
    }

    /// `<app local data>/<name>` (network.json, network-ca.pem), held while it is used.
    pub fn network_file(&self, name: &str) -> AppResult<(PathBuf, MutexGuard<'_, ()>)> {
        let dir = self
            .local_data
            .as_ref()
            .ok_or_else(|| AppError::Io("The app data folder is unavailable.".into()))?;
        let guard = self
            .network
            .lock()
            .map_err(|_| AppError::Io("The network settings are unavailable.".into()))?;
        std::fs::create_dir_all(dir)?;
        Ok((dir.join(name), guard))
    }

    /// Where the `stvd` scheme serves library files from (`/lib-<sha256>.<ext>`).
    pub fn library_store_dir(&self) -> Option<PathBuf> {
        self.library.as_ref().map(|lib| lib.store_dir())
    }

    /// Where the `stvd` scheme serves catalog thumbnails from (`/cat-<sha256>.png`).
    pub fn catalog_dir(&self) -> Option<PathBuf> {
        self.library.as_ref().map(|lib| lib.root().join("catalogs"))
    }

    /// Where convex decompositions are cached (PLAN 10.2), if the app cache is reachable.
    pub fn colliders_dir(&self) -> Option<PathBuf> {
        self.colliders.clone()
    }

    pub fn workspaces_dir(&self) -> AppResult<&Path> {
        self.workspaces
            .as_deref()
            .ok_or_else(|| AppError::Io("The app cache folder is unavailable.".into()))
    }

    pub fn config_dir(&self) -> Option<&Path> {
        self.config.as_deref()
    }

    /// Where the webview's asset writes go (the current workspace).
    pub fn geometry_dir(&self) -> Option<PathBuf> {
        let project = self.project().ok()?;
        project.workspace.as_ref().map(Workspace::geometry_dir)
    }

    /// Where chosen texture images go (the current workspace).
    pub fn textures_dir(&self) -> Option<PathBuf> {
        let project = self.project().ok()?;
        project.workspace.as_ref().map(Workspace::textures_dir)
    }

    /// Where the `stvd` scheme serves files from (the current workspace's `bundle/`).
    pub fn bundle_dir(&self) -> Option<PathBuf> {
        let project = self.project().ok()?;
        project.workspace.as_ref().map(Workspace::bundle_dir)
    }

    /// On exit. Unsaved changes (the webview never confirmed the close, e.g. it hung) or a
    /// save still running keep the workspace for crash recovery; otherwise it is deleted,
    /// even if a late autosave landed after the last save.
    pub fn shutdown(&self) {
        let Ok(mut project) = self.project() else {
            return;
        };
        let keep = project.dirty || project.busy;
        let pending = project.pending.take();
        let workspace = project.workspace.take();
        drop(project);
        if let Some(pending) = pending {
            pending.workspace.release();
        }
        if let Some(ws) = workspace {
            if keep {
                ws.release();
            } else {
                ws.discard();
            }
        }
    }
}
