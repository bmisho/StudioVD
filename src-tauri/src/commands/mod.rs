//! Thin `#[tauri::command]` handlers. Real work lives in domain modules (CLAUDE.md §2).

pub mod app;
pub mod assets;
pub mod catalog;
mod dialog;
pub mod export;
pub mod geometry;
pub mod import;
mod ipc;
pub mod library;
pub mod library_install;
pub mod network;
mod online;
pub mod project;
pub mod session;
