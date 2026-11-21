//! Export commands (PLAN 4.9): a save dialog in Rust hands out a write token; the webview
//! sends the finished file as a raw body.

use super::dialog::{clean_stem, with_extension};
use super::ipc::{header, into_path, raw_body};
use crate::error::{AppError, AppResult};
use crate::fsutil::write_atomic;
use crate::picked::{PickedFile, MAX_IMPORT_BYTES};
use crate::state::AppState;
use std::path::{Path, PathBuf};
use tauri::ipc::Request;
use tauri::{Runtime, State, Window};
use tauri_plugin_dialog::DialogExt;

fn export_extension(format: &str) -> AppResult<&'static str> {
    match format {
        "glb" => Ok("glb"),
        "stl" => Ok("stl"),
        // The schematic (PLAN 11.8).
        "svg" => Ok("svg"),
        "png" => Ok("png"),
        other => Err(AppError::InvalidInput(format!(
            "Unsupported export format '{other}' (expected glb, stl, svg or png)."
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

/// Largest credits sidecar (plain text).
const MAX_CREDITS_BYTES: usize = 1024 * 1024;

/// `part.stl` → `part.credits.txt`, beside the export. Only an STL has a sidecar: a GLB
/// carries its credits inside (`asset.copyright`, `asset.extras`).
fn credits_path(target: &Path) -> AppResult<PathBuf> {
    let is_stl = target
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("stl"));
    match target.file_stem().filter(|_| is_stl) {
        Some(stem) => {
            let mut name = stem.to_os_string();
            name.push(".credits.txt");
            Ok(target.with_file_name(name))
        }
        None => Err(AppError::InvalidInput(
            "Only an STL export has a credits file.".into(),
        )),
    }
}

/// The credits of an STL export (PLAN 9.8): text written beside the file the user chose,
/// named after it. The webview names no path: the export's own write token gives it.
#[tauri::command]
pub async fn write_export_credits(
    state: State<'_, AppState>,
    request: Request<'_>,
) -> AppResult<String> {
    let target = state
        .picked()?
        .target(header(&request, "x-export-token")?)?;
    let bytes = raw_body(&request)?;
    if bytes.len() > MAX_CREDITS_BYTES || std::str::from_utf8(bytes).is_err() {
        return Err(AppError::InvalidInput(
            "The credits are not text, or are too large.".into(),
        ));
    }
    let path = credits_path(&target)?;
    write_atomic(&path, bytes)?;
    Ok(crate::picked::file_name(&path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats() {
        assert_eq!(export_extension("glb").expect("glb"), "glb");
        assert_eq!(export_extension("svg").expect("svg"), "svg");
        assert_eq!(export_extension("png").expect("png"), "png");
        assert_eq!(export_extension("obj").unwrap_err().kind(), "invalidInput");
    }

    #[test]
    fn credits_sit_beside_an_stl_only() {
        let path = credits_path(Path::new("/out/My part.v2.STL")).expect("stl");
        assert_eq!(path, Path::new("/out/My part.v2.credits.txt"));
        assert!(credits_path(Path::new("/out/a.glb")).is_err());
        assert!(credits_path(Path::new("/out/stl")).is_err());
    }
}
