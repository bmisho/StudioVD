//! Project commands. Phase 2 stubs: the menu wiring and error path are real, the work
//! arrives in Phase 5 (project bundle).

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
