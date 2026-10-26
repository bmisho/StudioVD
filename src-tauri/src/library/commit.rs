//! Committing a staged pack (the user confirmed) or dropping it.

use super::install::Staged;
use super::installed::{self, InstalledComponent};
use super::verify::{referenced, store_path};
use super::Library;
use crate::error::{AppError, AppResult};
use crate::workspace::sha256_hex;
use std::collections::HashMap;
use std::fs;

fn bad<T>(reason: impl Into<String>) -> AppResult<T> {
    Err(AppError::InvalidInput(reason.into()))
}

/// Moves a confirmed pack into the store (one writer, blobs skipped when already there) and
/// records its components. A version already installed with other content is refused.
pub fn commit(lib: &Library, staged: Staged, now: u64) -> AppResult<Vec<InstalledComponent>> {
    let lock = lib.lock()?;
    let result = commit_locked(lib, &staged, now);
    let _ = fs::remove_dir_all(&staged.dir);
    drop(lock);
    result
}

fn commit_locked(lib: &Library, staged: &Staged, now: u64) -> AppResult<Vec<InstalledComponent>> {
    let mut all = installed::load(lib);
    for c in &staged.pack.components {
        let other = all.iter().find(|i| i.id == c.id && i.version == c.version);
        if other.is_some_and(|i| i.manifest_sha256 != c.manifest_sha256) {
            return bad(format!(
                "{} {} is already installed with other content; remove it first.",
                c.id, c.version
            ));
        }
    }
    for f in &staged.pack.files {
        let Some(blob) = store_path(&f.path, &f.sha256) else {
            continue;
        };
        let dest = lib.store_dir().join(&blob);
        if !dest.is_file() {
            fs::rename(staged.dir.join(&f.path), &dest)?;
        }
    }
    let by_path: HashMap<&str, &str> = staged
        .pack
        .files
        .iter()
        .map(|f| (f.path.as_str(), f.sha256.as_str()))
        .collect();
    let mut added = Vec::new();
    for c in &staged.pack.components {
        let dir = lib.component_dir(&c.id, &c.version);
        fs::create_dir_all(&dir)?;
        let bytes = fs::read(staged.dir.join(&c.manifest_path))?;
        if sha256_hex(&bytes) != c.manifest_sha256 {
            return bad(format!("{}'s manifest changed while installing", c.id));
        }
        fs::write(dir.join("component.json"), &bytes)?;
        let manifest: serde_json::Value =
            serde_json::from_slice(&bytes).or_else(|_| bad("manifest"))?;
        let record = InstalledComponent {
            id: c.id.clone(),
            version: c.version.clone(),
            manifest_sha256: c.manifest_sha256.clone(),
            origin: staged.origin,
            pack_sha256: Some(staged.pack_sha256.clone()),
            installed_at: now,
            blobs: referenced(&manifest, &by_path),
        };
        installed::write_record(lib, &record)?;
        all.retain(|i| !(i.id == record.id && i.version == record.version));
        all.push(record.clone());
        added.push(record);
    }
    installed::save(lib, &mut all)?;
    Ok(added)
}

/// The user declined: the staged files go.
pub fn cancel(staged: Staged) {
    let _ = fs::remove_dir_all(&staged.dir);
}
