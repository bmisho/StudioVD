//! Removing components and the store blobs nothing installed uses any more.

use super::installed::{self, InstalledComponent};
use super::{Library, BLOB_FOLDERS};
use crate::error::AppResult;
use std::collections::HashSet;
use std::fs;

/// Uninstalls one component version, then collects the blobs no other component names.
pub fn remove(lib: &Library, id: &str, version: &str) -> AppResult<Vec<InstalledComponent>> {
    let lock = lib.lock()?;
    let mut all = installed::load(lib);
    all.retain(|c| !(c.id == id && c.version == version));
    let dir = lib.component_dir(id, version);
    if dir.is_dir() {
        fs::remove_dir_all(&dir)?;
    }
    installed::save(lib, &mut all)?;
    collect_locked(lib, &all)?;
    drop(lock);
    Ok(all)
}

/// Deletes store blobs no installed component names; returns how many went.
fn collect_locked(lib: &Library, all: &[InstalledComponent]) -> AppResult<usize> {
    let used: HashSet<&str> = all
        .iter()
        .flat_map(|c| c.blobs.iter().map(String::as_str))
        .collect();
    let mut removed = 0;
    for folder in BLOB_FOLDERS {
        for entry in fs::read_dir(lib.store_dir().join(folder))?.flatten() {
            let name = format!("{folder}/{}", entry.file_name().to_string_lossy());
            if !used.contains(name.as_str()) && fs::remove_file(entry.path()).is_ok() {
                removed += 1;
            }
        }
    }
    Ok(removed)
}
