//! Asset writes (PLAN 4.1): the webview stores normalized GLBs under their SHA-256, which
//! Rust verifies. Texture images (PLAN 6.3) are chosen and stored here, so their bytes never
//! cross IPC. Reads go through the `stvd` URI scheme (`workspace::protocol`).

use super::import::both_cases;
use super::ipc::{blocking, header, into_path, raw_body};
use crate::error::{AppError, AppResult};
use crate::picked::{file_name, read_capped};
use crate::state::AppState;
use crate::workspace::texture::{write_texture, MAX_TEXTURE_BYTES};
use crate::workspace::write_asset as store_asset;
use serde::Serialize;
use tauri::ipc::Request;
use tauri::{AppHandle, Manager, Runtime, State, Window};
use tauri_plugin_dialog::DialogExt;

/// Returns false when the workspace already had the asset. The body is borrowed from the
/// request, so the hash and write run here rather than on the blocking pool (a copy of up
/// to 512 MiB would be the price of moving them).
#[tauri::command]
pub async fn write_asset(state: State<'_, AppState>, request: Request<'_>) -> AppResult<bool> {
    let dir = state
        .geometry_dir()
        .ok_or_else(|| AppError::Io("The project workspace could not be created.".into()))?;
    store_asset(&dir, header(&request, "x-asset-id")?, raw_body(&request)?)
}

/// A texture now in the workspace: the webview records it as `textures/<id>.<ext>`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedTexture {
    pub id: String,
    pub ext: &'static str,
    /// The chosen file's name, for display.
    pub name: String,
    pub width: u32,
    pub height: u32,
}

/// Material editor › Choose image: a PNG or JPEG through a file dialog, checked (format,
/// file size, pixel size) and stored under its SHA-256. `None` when cancelled.
#[tauri::command]
pub async fn import_texture<R: Runtime>(
    window: Window<R>,
    app: AppHandle<R>,
) -> AppResult<Option<ImportedTexture>> {
    let extensions = both_cases(&["png", "jpg", "jpeg"]);
    let filter: Vec<&str> = extensions.iter().map(String::as_str).collect();
    let Some(file) = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Choose a texture image")
        .add_filter("Images (PNG, JPEG)", &filter)
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = into_path(file)?;
    blocking(move || {
        let dir = app
            .state::<AppState>()
            .textures_dir()
            .ok_or_else(|| AppError::Io("The project workspace could not be created.".into()))?;
        let stored = write_texture(&dir, &read_capped(&path, MAX_TEXTURE_BYTES)?)?;
        Ok(Some(ImportedTexture {
            id: stored.id,
            ext: stored.kind.ext(),
            name: file_name(&path),
            width: stored.width,
            height: stored.height,
        }))
    })
    .await
}
