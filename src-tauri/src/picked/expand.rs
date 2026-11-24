//! Picked or dropped paths with every zip replaced by the models in it (PLAN 16.5).

use super::archive::{is_zip, unpack, LIMITS};
use super::file_name;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static NEXT: AtomicU64 = AtomicU64::new(0);

/// A folder name no other unpack uses: process, time and a counter.
fn fresh(imports: &Path) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    let n = NEXT.fetch_add(1, Ordering::Relaxed);
    imports.join(format!("{}-{nanos}-{n}", std::process::id()))
}

/// `paths` with each `.zip` unpacked under `imports` and replaced by its models; what an
/// archive left out (or an archive that could not be read) is named in the second list as
/// `archive.zip: entry`.
pub fn expand_archives(paths: &[PathBuf], imports: Option<&Path>) -> (Vec<PathBuf>, Vec<String>) {
    let mut out = Vec::with_capacity(paths.len());
    let mut skipped = Vec::new();
    for path in paths {
        if !is_zip(path) {
            out.push(path.clone());
            continue;
        }
        let name = file_name(path);
        let Some(imports) = imports else {
            skipped.push(format!("{name} (no cache folder to unpack it in)"));
            continue;
        };
        let unpacked = std::fs::create_dir_all(imports)
            .map_err(crate::error::AppError::from)
            .and_then(|()| unpack(path, &fresh(imports), &LIMITS));
        match unpacked {
            Ok(u) => {
                if u.models.is_empty() && u.skipped.is_empty() {
                    skipped.push(format!("{name} (no files in it)"));
                }
                out.extend(u.models);
                skipped.extend(u.skipped.into_iter().map(|s| format!("{name}: {s}")));
            }
            Err(e) => skipped.push(format!("{name} ({e})")),
        }
    }
    (out, skipped)
}

/// Removes zips unpacked by earlier sessions (folders not named after this process).
pub fn clean_imports(dir: &Path) {
    let mine = format!("{}-", std::process::id());
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if !entry.file_name().to_string_lossy().starts_with(&mine) {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}
