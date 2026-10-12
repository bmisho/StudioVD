//! Export commands (PLAN 4.9): a save dialog in Rust hands out a write token; the webview
//! sends the finished file as a raw body.

use super::dialog::{clean_stem, with_extension};
use super::ipc::{header, into_path, raw_body};
use crate::error::{AppError, AppResult};
use crate::fsutil::write_atomic;
use crate::picked::{PickedFile, MAX_IMPORT_BYTES};
use crate::state::AppState;
use tauri::ipc::Request;
use tauri::{Runtime, State, Window};
use tauri_plugin_dialog::DialogExt;

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
        .set_file_name(format!("{}.{ext}", clean_stem(&suggested_name)))
        .add_filter(ext.to_ascii_uppercase(), &[ext, &ext.to_ascii_uppercase()])
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let path = with_extension(into_path(file)?, ext)?;
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
    fn formats() {
        assert_eq!(export_extension("glb").expect("glb"), "glb");
        assert_eq!(export_extension("obj").unwrap_err().kind(), "invalidInput");
    }
}
