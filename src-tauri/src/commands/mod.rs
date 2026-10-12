//! Thin `#[tauri::command]` handlers. Real work lives in domain modules (CLAUDE.md §2).

pub mod app;
pub mod assets;
mod dialog;
pub mod export;
pub mod import;
mod ipc;
pub mod project;
pub mod session;
