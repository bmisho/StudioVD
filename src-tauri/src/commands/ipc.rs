//! Helpers shared by commands that take raw binary bodies or run blocking file work.

use crate::error::{AppError, AppResult};
use tauri::ipc::{InvokeBody, Request};

pub fn header<'a>(request: &'a Request<'_>, name: &str) -> AppResult<&'a str> {
    request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::InvalidInput(format!("Missing the {name} header.")))
}

/// The raw body of an invoke. Binary IPC needs the custom-protocol transport: if Tauri ever
/// falls back to postMessage, bytes arrive as JSON and are refused here (PLAN Phase 15: the
/// CSP must keep `ipc:` and `http://ipc.localhost` in connect-src).
pub fn raw_body<'a>(request: &'a Request<'_>) -> AppResult<&'a [u8]> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes),
        InvokeBody::Json(_) => Err(AppError::InvalidInput("Expected a binary body.".into())),
    }
}

/// Runs file work on the blocking pool, so large reads never stall the async workers that
/// also serve asset requests.
pub async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| AppError::Io(e.to_string()))?
}

pub fn into_path(file: tauri_plugin_dialog::FilePath) -> AppResult<std::path::PathBuf> {
    file.into_path()
        .map_err(|e| AppError::InvalidInput(e.to_string()))
}
