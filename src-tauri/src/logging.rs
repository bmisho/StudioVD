//! Logging (PLAN 15.5): `studiovd.log` in the app's log folder (Windows:
//! `%LOCALAPPDATA%\com.studiovd.desktop\logs`, Linux: `~/.local/share/com.studiovd.desktop/logs`),
//! rotated at 2 MiB with three old files kept; also stdout in development. Panics are written
//! before the process ends (release builds abort on panic), and the webview reports its
//! uncaught errors through `log_webview_error`.

use tauri::plugin::TauriPlugin;
use tauri::Runtime;
use tauri_plugin_log::{Builder, RotationStrategy, Target, TargetKind};

pub const MAX_LOG_BYTES: u128 = 2 * 1024 * 1024;

pub fn plugin<R: Runtime>() -> TauriPlugin<R> {
    let mut targets = vec![Target::new(TargetKind::LogDir {
        file_name: Some("studiovd".into()),
    })];
    if cfg!(debug_assertions) {
        targets.push(Target::new(TargetKind::Stdout));
    }
    Builder::new()
        .clear_targets()
        .targets(targets)
        .level(log::LevelFilter::Info)
        .max_file_size(MAX_LOG_BYTES)
        .rotation_strategy(RotationStrategy::KeepSome(3))
        .build()
}

/// A panic is logged (with where it happened) before the default hook runs.
pub fn install_panic_hook() {
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log::error!("panic: {info}");
        default(info);
    }));
}

/// One line of text from the webview: control characters escaped, at most 4 KiB, so a message
/// can neither forge log lines nor fill the disk.
pub fn clean_line(text: &str) -> String {
    let mut out: String = text
        .chars()
        .flat_map(|c| {
            if c.is_control() {
                c.escape_default().collect::<Vec<_>>()
            } else {
                vec![c]
            }
        })
        .take(4096)
        .collect();
    if text.chars().count() > out.chars().count() && !out.ends_with('…') {
        out.push('…');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::clean_line;

    #[test]
    fn webview_text_stays_one_bounded_line() {
        assert_eq!(clean_line("a\nb\r\tc"), "a\\nb\\r\\tc");
        assert_eq!(clean_line("ok"), "ok");
        let long = "x".repeat(10_000);
        let line = clean_line(&long);
        assert_eq!(line.chars().count(), 4097);
        assert!(line.ends_with('…'));
    }
}
