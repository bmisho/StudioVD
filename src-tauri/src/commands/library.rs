//! The local component library (PLAN 4.5, 9.2, 9.7): list, Install from file (stage, then
//! commit once the webview has validated every manifest and the user confirmed), remove, copy
//! a component's files into the project for insertion, save one from the project (Save as
//! component, Add to my library) and Export pack. Commands take ids, never paths.

use super::dialog::{clean_stem, with_extension};
use super::ipc::{blocking, into_path};
use crate::error::{AppError, AppResult};
use crate::library::commit::{cancel, commit};
use crate::library::export::{export_pack, ExportSummary};
use crate::library::from_project::{add_from_project, geometry_sizes};
use crate::library::install::{stage_pack, StagedSummary};
use crate::library::installed::{self, InstalledComponent, Origin};
use crate::library::{copy::copy_into_project, gc, packfile, publisher, Library};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::fs;
use tauri::{AppHandle, Manager, Runtime, Window};
use tauri_plugin_dialog::DialogExt;

/// Most manifest text one listing returns (each manifest is at most 4 MiB).
const MAX_LISTING_BYTES: usize = 64 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryEntry {
    pub id: String,
    pub version: String,
    pub manifest_sha256: String,
    pub origin: Origin,
    /// Vouched for by a signed catalog (Phase 14); Install from file never is.
    pub verified: bool,
    /// component.json as installed, for the webview's validation.
    pub manifest: String,
}

fn entries(lib: &Library, components: Vec<InstalledComponent>) -> Vec<LibraryEntry> {
    let mut total = 0usize;
    let mut out = Vec::new();
    for c in components {
        let path = lib.component_dir(&c.id, &c.version).join("component.json");
        let Ok(manifest) = fs::read_to_string(path) else {
            continue;
        };
        total += manifest.len();
        if total > MAX_LISTING_BYTES {
            break;
        }
        out.push(LibraryEntry {
            verified: c.origin == Origin::Official,
            id: c.id,
            version: c.version,
            manifest_sha256: c.manifest_sha256,
            origin: c.origin,
            manifest,
        });
    }
    out
}

fn library<R: Runtime>(app: &AppHandle<R>) -> AppResult<std::sync::Arc<Library>> {
    app.state::<AppState>().library()
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn bundle_dir<R: Runtime>(app: &AppHandle<R>) -> AppResult<std::path::PathBuf> {
    app.state::<AppState>()
        .bundle_dir()
        .ok_or_else(|| AppError::Io("The project workspace could not be created.".into()))
}

#[tauri::command]
pub async fn library_list<R: Runtime>(app: AppHandle<R>) -> AppResult<Vec<LibraryEntry>> {
    blocking(move || {
        let lib = library(&app)?;
        Ok(entries(&lib, installed::load(&lib)))
    })
    .await
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
        let (staged, summary) = stage_pack(&lib, &path)?;
        if let Some(previous) = state.staged()?.replace(staged) {
            cancel(previous);
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
        let staged = state.staged()?.take_if(|s| s.token == token);
        let staged = staged
            .ok_or_else(|| AppError::InvalidInput("Nothing is waiting to be installed.".into()))?;
        Ok(entries(&lib, commit(&lib, staged, now_secs())?))
    })
    .await
}

#[tauri::command]
pub async fn library_install_cancel<R: Runtime>(app: AppHandle<R>, token: String) -> AppResult<()> {
    blocking(move || {
        if let Some(staged) = app
            .state::<AppState>()
            .staged()?
            .take_if(|s| s.token == token)
        {
            cancel(staged);
        }
        Ok(())
    })
    .await
}

fn check_ref(id: &str, version: &str) -> AppResult<()> {
    if packfile::check_component_id(id) && packfile::check_version(version) {
        Ok(())
    } else {
        Err(AppError::InvalidInput(format!(
            "'{id}' {version} is not a component."
        )))
    }
}

#[tauri::command]
pub async fn library_remove<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    version: String,
) -> AppResult<Vec<LibraryEntry>> {
    check_ref(&id, &version)?;
    blocking(move || {
        let lib = library(&app)?;
        Ok(entries(&lib, gc::remove(&lib, &id, &version)?))
    })
    .await
}

/// Insertion: the component's geometry, textures and licence texts into the open project's
/// workspace. Returns how many files were new there.
#[tauri::command]
pub async fn library_copy_into_project<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    version: String,
) -> AppResult<usize> {
    check_ref(&id, &version)?;
    blocking(move || {
        let state = app.state::<AppState>();
        let lib = state.library()?;
        let record = installed::load(&lib)
            .into_iter()
            .find(|c| c.id == id && c.version == version)
            .ok_or_else(|| AppError::InvalidInput(format!("{id} {version} is not installed.")))?;
        copy_into_project(&lib, &record, &bundle_dir(&app)?)
    })
    .await
}

/// This installation's namespace for the user's own components (`u-` + six characters).
#[tauri::command]
pub async fn library_user_namespace<R: Runtime>(app: AppHandle<R>) -> AppResult<String> {
    blocking(move || publisher::namespace(&*library(&app)?)).await
}

/// Save as component: the sizes of the project's GLBs the manifest will name.
#[tauri::command]
pub async fn library_project_geometry_sizes<R: Runtime>(
    app: AppHandle<R>,
    files: Vec<String>,
) -> AppResult<Vec<u64>> {
    blocking(move || geometry_sizes(&bundle_dir(&app)?, &files)).await
}

/// Save as component and Add to my library: a component.json the webview built and validated,
/// with the project files it names. Returns the whole library.
#[tauri::command]
pub async fn library_add_from_project<R: Runtime>(
    app: AppHandle<R>,
    manifest: String,
) -> AppResult<Vec<LibraryEntry>> {
    blocking(move || {
        let lib = library(&app)?;
        let all = add_from_project(&lib, &bundle_dir(&app)?, &manifest, now_secs())?;
        Ok(entries(&lib, all))
    })
    .await
}

#[derive(Debug, Deserialize)]
pub struct ComponentKey {
    id: String,
    version: String,
}

/// Library › Export pack…: a save dialog in Rust, then the pack. `None` when cancelled.
#[tauri::command]
pub async fn library_export_pack<R: Runtime>(
    window: Window<R>,
    app: AppHandle<R>,
    components: Vec<ComponentKey>,
    suggested_name: String,
) -> AppResult<Option<ExportSummary>> {
    for c in &components {
        check_ref(&c.id, &c.version)?;
    }
    let Some(file) = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Export components as a pack")
        .set_file_name(format!("{}.stvdpack", clean_stem(&suggested_name)))
        .add_filter("StudioVD packs", &["stvdpack", "STVDPACK"])
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let path = with_extension(into_path(file)?, "stvdpack")?;
    let version = app.package_info().version.to_string();
    blocking(move || {
        let lib = library(&app)?;
        let refs: Vec<(String, String)> =
            components.into_iter().map(|c| (c.id, c.version)).collect();
        export_pack(&lib, &refs, &path, now_secs(), &version).map(Some)
    })
    .await
}
