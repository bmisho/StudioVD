//! Opening a `.stvd` from outside the app (PLAN 5.4): the command line of the first launch,
//! a second launch forwarded by the single-instance plugin, or a drop on the window. Rust
//! keeps the path; the webview pulls the request with `project_open_launch`.

use super::window::MAIN_WINDOW;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// The `.stvd` waiting for the webview. Managed before any plugin (`Builder::manage`), so a
/// second launch that arrives while this one is still starting can already hand it over.
#[derive(Default)]
pub struct LaunchSlot(Mutex<Option<PathBuf>>);

impl LaunchSlot {
    pub fn put(&self, path: PathBuf) {
        if let Ok(mut slot) = self.0.lock() {
            *slot = Some(path);
        }
    }

    /// The command-line file, unless a forwarded launch got there first.
    pub fn put_if_empty(&self, path: PathBuf) {
        if let Ok(mut slot) = self.0.lock() {
            slot.get_or_insert(path);
        }
    }

    pub fn take(&self) -> Option<PathBuf> {
        self.0.lock().ok().and_then(|mut slot| slot.take())
    }
}

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
    if let Some(slot) = app.try_state::<LaunchSlot>() {
        slot.put(path);
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
/// session bus address it cannot parse, such as `disabled:` in a container. It is checked with
/// the plugin's own parser; unset is fine (the default bus is tried, and failing is harmless).
/// Without the plugin, each launch is simply its own instance.
#[cfg(target_os = "linux")]
pub fn single_instance_usable() -> bool {
    bus_address_usable(std::env::var("DBUS_SESSION_BUS_ADDRESS").ok().as_deref())
}

#[cfg(target_os = "linux")]
fn bus_address_usable(address: Option<&str>) -> bool {
    use std::str::FromStr;
    address.is_none_or(|address| zbus::Address::from_str(address).is_ok())
}

#[cfg(not(target_os = "linux"))]
pub fn single_instance_usable() -> bool {
    true
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

    #[cfg(target_os = "linux")]
    #[test]
    fn bus_addresses_the_plugin_cannot_parse_disable_it() {
        for bad in ["disabled:", "unix:", "tcp:", "", "nonsense"] {
            assert!(!bus_address_usable(Some(bad)), "{bad}");
        }
        assert!(bus_address_usable(Some("unix:path=/run/user/1000/bus")));
        assert!(bus_address_usable(None), "unset: the default bus is tried");
    }

    #[test]
    fn a_forwarded_launch_wins_over_the_command_line() {
        let slot = LaunchSlot::default();
        slot.put(PathBuf::from("/forwarded.stvd"));
        slot.put_if_empty(PathBuf::from("/argv.stvd"));
        assert_eq!(slot.take(), Some(PathBuf::from("/forwarded.stvd")));
        assert_eq!(slot.take(), None);
    }
}
