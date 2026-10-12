//! Export commands (PLAN 4.9): a save dialog in Rust hands out a write token; the webview
//! sends the finished file as a raw body.

use super::ipc::{header, into_path, raw_body};
use crate::error::{AppError, AppResult};
use crate::picked::{file_name, PickedFile, MAX_IMPORT_BYTES};
use crate::state::AppState;
use crate::workspace::write_atomic;
use std::path::PathBuf;
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

/// A file-name stem for the dialog: no separators or control characters, at most 120 chars.
fn clean_stem(name: &str) -> String {
    let stem: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .take(120)
        .collect();
    let stem = stem.trim().trim_matches('.').to_owned();
    if stem.is_empty() {
        "assembly".into()
    } else {
        stem
    }
}

/// The file to write. The extension is added when missing, but then the dialog's overwrite
/// prompt saw another name (GTK asks about `bracket`, we would write `bracket.stl`), so an
/// existing file under the final name is refused instead of silently replaced.
fn export_path(mut chosen: PathBuf, ext: &str) -> AppResult<PathBuf> {
    if chosen
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case(ext))
    {
        return Ok(chosen);
    }
    chosen.as_mut_os_string().push(format!(".{ext}"));
    if chosen.exists() {
        return Err(AppError::InvalidInput(format!(
            "{} already exists. Export again and pick it in the dialog to replace it.",
            file_name(&chosen)
        )));
    }
    Ok(chosen)
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
    let path = export_path(into_path(file)?, ext)?;
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
    use std::fs;

    #[test]
    fn formats_and_stems() {
        assert_eq!(export_extension("glb").expect("glb"), "glb");
        assert_eq!(export_extension("obj").unwrap_err().kind(), "invalidInput");
        assert_eq!(clean_stem("../a/b:c"), "_a_b_c");
        assert_eq!(clean_stem("  ...  "), "assembly");
    }

    #[test]
    fn an_added_extension_never_replaces_an_existing_file() {
        let dir = std::env::temp_dir().join(format!("studiovd-export-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("dir");
        fs::write(dir.join("bracket.stl"), b"original").expect("original");
        // Typed with the extension: the dialog already asked about this exact file.
        assert!(export_path(dir.join("bracket.STL"), "stl").is_ok());
        // Typed without it: the dialog asked about `bracket`, which does not exist.
        let err = export_path(dir.join("bracket"), "stl").unwrap_err();
        assert_eq!(err.kind(), "invalidInput");
        let fresh = export_path(dir.join("new"), "stl").expect("new name");
        assert_eq!(fresh, dir.join("new.stl"));
        let _ = fs::remove_dir_all(dir);
    }
}
