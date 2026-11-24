//! Import commands (PLAN 4.1-4.2). Thin: the work lives in `picked`. Large payloads cross IPC
//! as raw bytes, never as JSON (CLAUDE.md §6).

use super::ipc::{blocking, into_path};
use crate::error::AppResult;
use crate::picked::{self, expand_archives, DroppedFiles, IMPORT_EXTENSIONS, MAX_IMPORT_BYTES};
use crate::project::launch;
use crate::state::AppState;
use std::path::PathBuf;
use tauri::ipc::Response;
use tauri::{AppHandle, Emitter, Manager, Runtime, State, Window};
use tauri_plugin_dialog::DialogExt;

/// GTK file filters are case-sensitive, and CAD tools often write `.STEP`.
pub(super) fn both_cases(extensions: &[&str]) -> Vec<String> {
    extensions
        .iter()
        .flat_map(|e| [e.to_ascii_lowercase(), e.to_ascii_uppercase()])
        .collect()
}

/// File › Import: the dialog runs here, the webview gets tokens. A file that cannot be
/// registered (deleted meanwhile, not a regular file) is reported, not fatal. A zip (a
/// GrabCAD download, PLAN 16.5) is unpacked and its models offered instead.
#[tauri::command]
pub async fn pick_import_files<R: Runtime>(
    window: Window<R>,
    state: State<'_, AppState>,
) -> AppResult<DroppedFiles> {
    let mut accepted: Vec<&str> = IMPORT_EXTENSIONS.to_vec();
    accepted.push("zip");
    let extensions = both_cases(&accepted);
    let filter: Vec<&str> = extensions.iter().map(String::as_str).collect();
    let files = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Import 3D or CAD files")
        .add_filter("3D and CAD files, or zips of them", &filter)
        .blocking_pick_files()
        .unwrap_or_default();
    let paths = files
        .into_iter()
        .map(into_path)
        .collect::<AppResult<Vec<_>>>()?;
    let imports = state.imports_dir().map(PathBuf::from);
    let (paths, skipped) =
        blocking(move || Ok(expand_archives(&paths, imports.as_deref()))).await?;
    Ok(with_skipped(state.picked()?.add_dropped(&paths), skipped))
}

/// `dropped` with what unpacking zips left out named first.
fn with_skipped(mut dropped: DroppedFiles, mut skipped: Vec<String>) -> DroppedFiles {
    skipped.append(&mut dropped.skipped);
    dropped.skipped = skipped;
    dropped
}

/// Files dropped on the window: supported ones get tokens and go to the webview as an
/// `import-drop` event (Tauri's own drag-drop event would hand it paths). A window's own
/// webview reports drops as a window event, a child webview as a webview event.
pub fn files_dropped<R: Runtime, T: Manager<R> + Emitter<R>>(target: &T, paths: &[PathBuf]) {
    // A dropped project opens (the rest of that drop is ignored, and named as skipped).
    if let Some(project) = paths.iter().find(|p| launch::is_project_file(p)) {
        launch::request_open(target.app_handle(), project.clone());
        let skipped: Vec<String> = paths
            .iter()
            .filter(|p| *p != project)
            .map(|p| crate::picked::file_name(p))
            .collect();
        if !skipped.is_empty() {
            let _ = target.emit(
                "import-drop",
                DroppedFiles {
                    files: Vec::new(),
                    skipped,
                },
            );
        }
        return;
    }
    // Unpacking a dropped zip can take a while: off the event thread.
    let app = target.app_handle().clone();
    let paths = paths.to_vec();
    std::thread::spawn(move || {
        let state = app.state::<AppState>();
        let (paths, skipped) = expand_archives(&paths, state.imports_dir());
        let Ok(mut picked) = state.picked() else {
            return;
        };
        let dropped = with_skipped(picked.add_dropped(&paths), skipped);
        drop(picked);
        let _ = app.emit("import-drop", dropped);
    });
}

#[tauri::command]
pub async fn read_import_file<R: Runtime>(app: AppHandle<R>, token: String) -> AppResult<Response> {
    blocking(move || {
        let path = app.state::<AppState>().picked()?.source(&token)?;
        Ok(Response::new(picked::read_capped(&path, MAX_IMPORT_BYTES)?))
    })
    .await
}

/// A file the .gltf (buffers) or .obj (material libraries) behind `token` names next to it.
#[tauri::command]
pub async fn read_import_resource<R: Runtime>(
    app: AppHandle<R>,
    token: String,
    relative: String,
) -> AppResult<Response> {
    blocking(move || {
        let state = app.state::<AppState>();
        let bytes = picked::read_resource(|| state.picked(), &token, &relative)?;
        Ok(Response::new(bytes))
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_list_both_cases() {
        assert_eq!(both_cases(&["step"]), ["step", "STEP"]);
    }
}
