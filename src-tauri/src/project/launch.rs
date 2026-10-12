//! Opening a `.stvd` from outside the app (PLAN 5.4): the command line of the first launch,
//! a second launch forwarded by the single-instance plugin, or a drop on the window. Rust
//! keeps the path; the webview pulls the request with `project_open_launch`.

use super::window::MAIN_WINDOW;
use crate::state::AppState;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// Tells the webview a launch file is waiting.
pub const OPEN_REQUESTED_EVENT: &str = "open-requested";

pub fn is_project_file(path: &Path) -> bool {
    path.extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("stvd"))
}

/// The first `.stvd` argument (flags skipped), relative paths resolved against `cwd`.
pub fn project_argument(args: impl IntoIterator<Item = OsString>, cwd: &Path) -> Option<PathBuf> {
    args.into_iter()
        .filter(|a| !a.to_string_lossy().starts_with('-'))
        .map(PathBuf::from)
        .find(|p| is_project_file(p))
        .map(|p| if p.is_absolute() { p } else { cwd.join(p) })
}

/// Queues `path` for the webview and brings the window forward. Never blocks: the
/// single-instance callback runs inside the Windows message loop.
pub fn request_open<R: Runtime>(app: &AppHandle<R>, path: PathBuf) {
    if let Ok(mut project) = app.state::<AppState>().project() {
        project.launch = Some(path);
    }
    let _ = app.emit_to(MAIN_WINDOW, OPEN_REQUESTED_EVENT, ());
    focus_main(app);
}

pub fn focus_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Whether the single-instance plugin can start: on Linux it panics (and the app aborts) on a
/// set but malformed `DBUS_SESSION_BUS_ADDRESS`, such as an empty one in a container. Without
/// it, each launch is simply its own instance.
pub fn single_instance_usable() -> bool {
    !cfg!(target_os = "linux")
        || std::env::var("DBUS_SESSION_BUS_ADDRESS").map_or(true, |a| a.contains(':'))
}

/// Single-instance forwarding: a second launch passes its arguments to this instance. On
/// Linux it is a D-Bus name; dev builds take their own, so `tauri dev` still starts next to
/// an installed StudioVD (on Windows the named mutex has no such override).
pub fn single_instance<R: Runtime>() -> TauriPlugin<R> {
    let builder = tauri_plugin_single_instance::Builder::new().callback(|app, argv, cwd| {
        let args = argv.into_iter().skip(1).map(OsString::from);
        match project_argument(args, Path::new(&cwd)) {
            Some(path) => request_open(app, path),
            None => focus_main(app),
        }
    });
    if cfg!(debug_assertions) {
        builder.dbus_id("com.studiovd.desktop.dev").build()
    } else {
        builder.build()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_first_project_argument() {
        let cwd = Path::new("/home/me");
        let args = |list: &[&str]| list.iter().map(OsString::from).collect::<Vec<_>>();
        assert_eq!(
            project_argument(args(&["--flag", "notes.txt", "robot.STVD", "b.stvd"]), cwd),
            Some(PathBuf::from("/home/me/robot.STVD"))
        );
        assert_eq!(
            project_argument(args(&["/abs/arm.stvd"]), cwd),
            Some(PathBuf::from("/abs/arm.stvd"))
        );
        assert_eq!(
            project_argument(args(&["-x.stvd", "model.step"]), cwd),
            None
        );
    }
}
