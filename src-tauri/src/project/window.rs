//! The main window's title and the unsaved-changes guard on close (PLAN 5.3). Rust owns
//! both, so the webview needs no window permissions beyond `close`.

use super::Project;
use crate::state::AppState;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, Runtime, Window};

pub const MAIN_WINDOW: &str = "main";
/// Sent to the webview when the user closes a window with unsaved changes.
pub const CLOSE_REQUESTED_EVENT: &str = "close-requested";
/// A webview that has not answered a close request in this time is hung: the next close
/// goes through (the autosave keeps the work for recovery).
const UNRESPONSIVE: Duration = Duration::from_secs(10);

pub fn title(project: &Project) -> String {
    let name = project
        .info()
        .file_name
        .unwrap_or_else(|| "Untitled".into());
    let dirty = if project.dirty { "*" } else { "" };
    format!("{name}{dirty} \u{2014} StudioVD")
}

pub fn update_title<R: Runtime>(app: &AppHandle<R>, project: &Project) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.set_title(&title(project));
    }
}

/// Decides a close request on the main window: returns true to let it close. With unsaved
/// changes it asks the webview instead, which answers with `close_confirmed` (or cancels).
pub fn allow_close<R: Runtime>(window: &Window<R>) -> bool {
    if window.label() != MAIN_WINDOW {
        return true;
    }
    let Some(state) = window.try_state::<AppState>() else {
        return true;
    };
    let Ok(mut project) = state.project() else {
        return true;
    };
    if !project.dirty
        || project
            .close_asked
            .is_some_and(|t| t.elapsed() > UNRESPONSIVE)
    {
        return true;
    }
    project.close_asked = Some(Instant::now());
    drop(project);
    let _ = window.emit_to(MAIN_WINDOW, CLOSE_REQUESTED_EVENT, ());
    false
}
