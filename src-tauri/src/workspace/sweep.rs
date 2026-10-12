//! Startup sweep of workspaces left behind by crashed or killed instances.

use super::{Workspace, AUTOSAVE_FILE};
use std::fs;
use std::path::Path;
use std::time::{Duration, SystemTime};

/// A leftover without unsaved changes holds nothing the `.stvd` lacks.
pub const LEFTOVER_AGE: Duration = Duration::from_secs(24 * 60 * 60);
/// Unsaved work is offered for recovery; never offered or ignored, it goes after this long.
pub const RECOVERABLE_AGE: Duration = Duration::from_secs(90 * 24 * 60 * 60);

fn age(path: &Path, now: SystemTime) -> Option<Duration> {
    let modified = fs::metadata(path).and_then(|m| m.modified()).ok()?;
    now.duration_since(modified).ok()
}

/// Deletes stale workspaces under `base`, except `keep` and any a running instance holds
/// (the lock is taken first, so nobody adopts a folder while it is being deleted). Age is
/// the autosave's when there is one, else the folder's. Errors on single entries are
/// skipped. Returns how many were deleted.
pub fn clean_stale(base: &Path, keep: &Path, leftover: Duration, recoverable: Duration) -> usize {
    let Ok(entries) = fs::read_dir(base) else {
        return 0;
    };
    let now = SystemTime::now();
    let mut deleted = 0;
    for entry in entries.flatten() {
        let root = entry.path();
        if root == keep || !entry.file_name().to_string_lossy().starts_with("ws-") {
            continue;
        }
        let autosave = root.join(AUTOSAVE_FILE);
        let (stamp, max) = if autosave.is_file() {
            (autosave, recoverable)
        } else {
            (root.clone(), leftover)
        };
        if !age(&stamp, now).is_some_and(|a| a > max) {
            continue;
        }
        match Workspace::adopt(&root) {
            Ok(ws) => {
                ws.discard();
                deleted += 1;
            }
            // No lock file at all: an interrupted create, nothing anyone holds.
            Err(_) if !root.join(super::LOCK_FILE).exists() => {
                deleted += usize::from(fs::remove_dir_all(&root).is_ok());
            }
            Err(_) => {} // held by a running instance, or unreadable
        }
    }
    deleted
}
