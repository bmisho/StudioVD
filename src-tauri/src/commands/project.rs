//! Project commands (PLAN 5.3): New, Open (dialog, recent, launch), Save, Save As. The work
//! lives in `crate::project`; file I/O runs on the blocking pool.

use super::dialog::{clean_stem, with_extension};
use super::ipc::{blocking, header, into_path, raw_body};
use crate::error::{AppError, AppResult};
use crate::picked::PickedFile;
use crate::project::launch::LaunchSlot;
use crate::project::open::{self, PendingInfo};
use crate::project::window::{update_title, MAIN_WINDOW};
use crate::project::{recent, save, ProjectInfo};
use crate::state::AppState;
use tauri::ipc::{Request, Response};
use tauri::{AppHandle, Manager, Runtime, State, Window};
use tauri_plugin_dialog::DialogExt;

fn refresh_title<R: Runtime>(app: &AppHandle<R>) {
    if let Ok(project) = app.state::<AppState>().project() {
        update_title(app, &project);
    }
}

#[tauri::command]
pub fn project_info(state: State<'_, AppState>) -> AppResult<ProjectInfo> {
    Ok(state.project()?.info())
}

#[tauri::command]
pub async fn project_new<R: Runtime>(app: AppHandle<R>) -> AppResult<ProjectInfo> {
    let handle = app.clone();
    let info = blocking(move || save::new_project(&handle.state::<AppState>())).await?;
    refresh_title(&app);
    Ok(info)
}

/// Open dialog; then the file is extracted and waits for `project_commit`.
#[tauri::command]
pub async fn project_open<R: Runtime>(window: Window<R>) -> AppResult<Option<PendingInfo>> {
    let Some(file) = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Open Project")
        .add_filter("StudioVD project", &["stvd", "STVD"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = into_path(file)?;
    let app = window.app_handle().clone();
    blocking(move || open::load(&app.state::<AppState>(), path).map(Some)).await
}

#[tauri::command]
pub async fn project_open_recent<R: Runtime>(
    app: AppHandle<R>,
    id: String,
) -> AppResult<PendingInfo> {
    blocking(move || {
        let state = app.state::<AppState>();
        let config = state
            .config_dir()
            .ok_or_else(|| AppError::Io("No config folder.".into()))?;
        let path = recent::resolve(config, &id).ok_or_else(|| {
            AppError::InvalidInput("That project is no longer in the list.".into())
        })?;
        if !path.is_file() {
            recent::remove(config, &id);
            return Err(AppError::InvalidInput(format!(
                "{} no longer exists; it was removed from the list.",
                crate::picked::file_name(&path)
            )));
        }
        open::load(&state, path)
    })
    .await
}

/// A `.stvd` from the command line, a second launch or a drop, if one is waiting.
#[tauri::command]
pub async fn project_open_launch<R: Runtime>(app: AppHandle<R>) -> AppResult<Option<PendingInfo>> {
    blocking(move || {
        let state = app.state::<AppState>();
        let path = app.state::<LaunchSlot>().take();
        path.map(|p| {
            if !p.is_file() {
                return Err(AppError::InvalidInput(format!(
                    "{} does not exist.",
                    crate::picked::file_name(&p)
                )));
            }
            open::load(&state, p)
        })
        .transpose()
    })
    .await
}

#[tauri::command]
pub async fn project_pending_scene<R: Runtime>(app: AppHandle<R>) -> AppResult<Response> {
    blocking(move || open::scene(&app.state::<AppState>()).map(Response::new)).await
}

#[tauri::command]
pub async fn project_commit<R: Runtime>(app: AppHandle<R>) -> AppResult<ProjectInfo> {
    let handle = app.clone();
    let info = blocking(move || open::commit(&handle.state::<AppState>())).await?;
    refresh_title(&app);
    Ok(info)
}

#[tauri::command]
pub async fn project_discard<R: Runtime>(app: AppHandle<R>) -> AppResult<()> {
    blocking(move || open::discard(&app.state::<AppState>())).await
}

/// Save As dialog. Returns a write token for `project_save`, or nothing if cancelled.
#[tauri::command]
pub async fn project_pick_save_path<R: Runtime>(
    window: Window<R>,
    state: State<'_, AppState>,
    suggested_name: String,
) -> AppResult<Option<PickedFile>> {
    let Some(file) = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Save Project As")
        .set_file_name(format!("{}.stvd", clean_stem(&suggested_name)))
        .add_filter("StudioVD project", &["stvd", "STVD"])
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let path = with_extension(into_path(file)?, "stvd")?;
    Ok(Some(state.picked()?.add_target(path)))
}

/// Saves the project. The body is scene.json followed by an optional PNG thumbnail
/// (`x-scene-length` splits them); `x-target-token` (from Save As) names a new file.
#[tauri::command]
pub async fn project_save<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    request: Request<'_>,
) -> AppResult<ProjectInfo> {
    let body = raw_body(&request)?;
    let scene_len: usize = header(&request, "x-scene-length")?
        .parse()
        .map_err(|_| AppError::InvalidInput("Bad x-scene-length header.".into()))?;
    if scene_len > body.len() {
        return Err(AppError::InvalidInput("Bad x-scene-length header.".into()));
    }
    let target = match request.headers().get("x-target-token") {
        Some(token) => {
            let token = token
                .to_str()
                .map_err(|_| AppError::InvalidInput("Bad token.".into()))?;
            Some(state.picked()?.target(token)?)
        }
        None => None,
    };
    let (scene, thumbnail) = body.split_at(scene_len);
    let (scene, thumbnail) = (
        scene.to_vec(),
        (!thumbnail.is_empty()).then(|| thumbnail.to_vec()),
    );
    let handle = app.clone();
    let saved = blocking(move || {
        save::save(
            &handle.state::<AppState>(),
            &scene,
            thumbnail.as_deref(),
            target,
        )
    })
    .await;
    // The window was closed while the file was being written: close it now if that worked.
    let close = std::mem::take(&mut state.project()?.close_when_idle);
    refresh_title(&app);
    let info = saved?;
    if close {
        if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
            let _ = window.close();
        }
    }
    Ok(info)
}
