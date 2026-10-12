//! Asset writes (PLAN 4.1): the webview stores normalized GLBs under their SHA-256, which
//! Rust verifies. Reads go through the `stvd` URI scheme (`workspace::protocol`).

use super::ipc::{header, raw_body};
use crate::error::AppResult;
use crate::state::AppState;
use tauri::ipc::Request;
use tauri::State;

/// Returns false when the workspace already had the asset. The body is borrowed from the
/// request, so the hash and write run here rather than on the blocking pool (a copy of up
/// to 512 MiB would be the price of moving them).
#[tauri::command]
pub async fn write_asset(state: State<'_, AppState>, request: Request<'_>) -> AppResult<bool> {
    state
        .workspace()?
        .write_asset(header(&request, "x-asset-id")?, raw_body(&request)?)
}
