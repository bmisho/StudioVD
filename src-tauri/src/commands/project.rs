//! Project and import/export commands. Phase 2 stubs: the menu wiring and error path are
//! real, the work arrives in Phase 4 (import/export) and Phase 5 (project bundle).

use crate::error::{AppError, AppResult};

#[tauri::command]
pub fn project_new() -> AppResult<()> {
    Err(AppError::not_implemented("Creating projects", 5))
}

#[tauri::command]
pub fn project_open() -> AppResult<()> {
    Err(AppError::not_implemented("Opening projects", 5))
}

#[tauri::command]
pub fn project_save() -> AppResult<()> {
    Err(AppError::not_implemented("Saving projects", 5))
}

#[tauri::command]
pub fn project_save_as() -> AppResult<()> {
    Err(AppError::not_implemented("Saving projects", 5))
}

#[tauri::command]
pub fn import_files() -> AppResult<()> {
    Err(AppError::not_implemented("Importing CAD files", 4))
}

#[tauri::command]
pub fn export_scene(format: String) -> AppResult<()> {
    match format.as_str() {
        "glb" | "stl" => Err(AppError::not_implemented("Exporting the scene", 4)),
        other => Err(AppError::InvalidInput(format!(
            "Unsupported export format '{other}' (expected 'glb' or 'stl')."
        ))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_rejects_unknown_formats() {
        assert_eq!(
            export_scene("obj".into()).unwrap_err().kind(),
            "invalidInput"
        );
        assert_eq!(
            export_scene("glb".into()).unwrap_err().kind(),
            "notImplemented"
        );
    }
}
