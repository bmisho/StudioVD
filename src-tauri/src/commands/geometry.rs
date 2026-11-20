//! Heavy geometry for the webview (PLAN 10.2): convex decomposition of a part's mesh.

use super::ipc::{blocking, raw_body};
use crate::error::AppResult;
use crate::geometry::decompose::{decompose_cached, MAX_TRIANGLES, MAX_VERTICES};
use crate::state::AppState;
use tauri::ipc::{Request, Response};
use tauri::State;

/// Largest mesh body accepted (the decomposer's own caps, in its wire format).
const MAX_MESH_BYTES: usize = 8 + 12 * MAX_VERTICES + 12 * MAX_TRIANGLES;

/// The mesh in the body (decompose.rs wire format) as convex pieces, from the cache when
/// this exact mesh was split before. Seconds for a detailed part: it runs off the async pool.
#[tauri::command]
pub async fn decompose_mesh(
    state: State<'_, AppState>,
    request: Request<'_>,
) -> AppResult<Response> {
    let body = raw_body(&request)?;
    if body.len() > MAX_MESH_BYTES {
        return Err(crate::error::AppError::InvalidInput(
            "The mesh is too large to decompose.".into(),
        ));
    }
    let bytes = body.to_vec();
    let cache = state.colliders_dir();
    blocking(move || decompose_cached(&bytes, cache.as_deref()).map(Response::new)).await
}
