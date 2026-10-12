//! Import, asset and export commands (PLAN 4.1, 4.9). Thin: the work lives in `picked` and
//! `workspace`. Large payloads cross IPC as raw bytes, never as JSON (CLAUDE.md §6).

use crate::error::{AppError, AppResult};
use crate::picked::{self, PickedFile, IMPORT_EXTENSIONS, MAX_IMPORT_BYTES};
use crate::state::AppState;
use crate::workspace::write_atomic;
use serde::Serialize;
use std::path::PathBuf;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{Emitter, Manager, Runtime, State, Window};
use tauri_plugin_dialog::DialogExt;

/// GTK file filters are case-sensitive, and CAD tools often write `.STEP`.
fn both_cases(extensions: &[&str]) -> Vec<String> {
    extensions
        .iter()
        .flat_map(|e| [e.to_ascii_lowercase(), e.to_ascii_uppercase()])
        .collect()
}

fn into_path(file: tauri_plugin_dialog::FilePath) -> AppResult<PathBuf> {
    file.into_path()
        .map_err(|e| AppError::InvalidInput(e.to_string()))
}

#[tauri::command]
pub async fn pick_import_files<R: Runtime>(
    window: Window<R>,
    state: State<'_, AppState>,
) -> AppResult<Vec<PickedFile>> {
    let extensions = both_cases(&IMPORT_EXTENSIONS);
    let filter: Vec<&str> = extensions.iter().map(String::as_str).collect();
    let Some(files) = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Import 3D or CAD files")
        .add_filter("3D and CAD files", &filter)
        .blocking_pick_files()
    else {
        return Ok(Vec::new());
    };
    let mut picked = state.picked()?;
    files
        .into_iter()
        .map(|f| picked.add_source(into_path(f)?))
        .collect()
}

/// Files dropped on the window: supported ones get tokens and go to the webview as an
/// `import-drop` event (Tauri's own drag-drop event would hand it paths). A window's own
/// webview reports drops as a window event, a child webview as a webview event.
pub fn files_dropped<R: Runtime, T: Manager<R> + Emitter<R>>(target: &T, paths: &[PathBuf]) {
    let state = target.state::<AppState>();
    let Ok(mut picked) = state.picked() else {
        return;
    };
    let dropped = picked.add_dropped(paths);
    drop(picked);
    let _ = target.emit("import-drop", dropped);
}

#[tauri::command]
pub async fn read_import_file(state: State<'_, AppState>, token: String) -> AppResult<Response> {
    let path = state.picked()?.source(&token)?;
    Ok(Response::new(picked::read_capped(&path, MAX_IMPORT_BYTES)?))
}

/// A file a .gltf (buffers) or .obj (material library) refers to, next to it on disk.
#[tauri::command]
pub async fn read_import_resource(
    state: State<'_, AppState>,
    token: String,
    relative: String,
) -> AppResult<Response> {
    let model = state.picked()?.source(&token)?;
    let path = picked::resolve_sibling(&model, &relative)?;
    Ok(Response::new(picked::read_capped(&path, MAX_IMPORT_BYTES)?))
}

fn header<'a>(request: &'a Request<'_>, name: &str) -> AppResult<&'a str> {
    request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::InvalidInput(format!("Missing the {name} header.")))
}

fn raw_body<'a>(request: &'a Request<'_>) -> AppResult<&'a [u8]> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes),
        InvokeBody::Json(_) => Err(AppError::InvalidInput("Expected a binary body.".into())),
    }
}

/// Stores a normalized asset (GLB) under its SHA-256, which Rust verifies. Returns false when
/// the workspace already had it.
#[tauri::command]
pub async fn write_asset(state: State<'_, AppState>, request: Request<'_>) -> AppResult<bool> {
    state
        .workspace()?
        .write_asset(header(&request, "x-asset-id")?, raw_body(&request)?)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    /// Where assets live; the webview loads `<geometryDir>/<id>.glb` via the asset protocol.
    geometry_dir: String,
}

#[tauri::command]
pub fn workspace_info(state: State<'_, AppState>) -> AppResult<WorkspaceInfo> {
    let dir = state.workspace()?.geometry_dir();
    Ok(WorkspaceInfo {
        geometry_dir: dir.to_string_lossy().into_owned(),
    })
}

fn export_extension(format: &str) -> AppResult<&'static str> {
    match format {
        "glb" => Ok("glb"),
        "stl" => Ok("stl"),
        other => Err(AppError::InvalidInput(format!(
            "Unsupported export format '{other}' (expected 'glb' or 'stl')."
        ))),
    }
}

/// Save dialog for an export. Returns a write token, or nothing if the user cancelled.
#[tauri::command]
pub async fn pick_export_path<R: Runtime>(
    window: Window<R>,
    state: State<'_, AppState>,
    format: String,
    suggested_name: String,
) -> AppResult<Option<PickedFile>> {
    let ext = export_extension(&format)?;
    let Some(file) = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Export")
        .set_file_name(format!("{suggested_name}.{ext}"))
        .add_filter(ext.to_ascii_uppercase(), &[ext, &ext.to_ascii_uppercase()])
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let mut path = into_path(file)?;
    if !path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case(ext))
    {
        path.as_mut_os_string().push(format!(".{ext}"));
    }
    Ok(Some(state.picked()?.add_target(path)))
}

#[tauri::command]
pub async fn write_export(state: State<'_, AppState>, request: Request<'_>) -> AppResult<()> {
    let path = state
        .picked()?
        .target(header(&request, "x-export-token")?)?;
    let bytes = raw_body(&request)?;
    if bytes.len() as u64 > MAX_IMPORT_BYTES {
        return Err(AppError::InvalidInput("The export is too large.".into()));
    }
    write_atomic(&path, bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_list_both_cases_and_exports_know_their_formats() {
        assert_eq!(both_cases(&["step"]), ["step", "STEP"]);
        assert_eq!(export_extension("glb").expect("glb"), "glb");
        assert_eq!(export_extension("obj").unwrap_err().kind(), "invalidInput");
    }
}
