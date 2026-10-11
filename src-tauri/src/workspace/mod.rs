//! Per-project working directory (PLAN 1.1 decision 2, Phase 4.1). Imported geometry lives in
//! `<app cache>/workspaces/<id>/geometry/<sha256>.glb`; the webview loads it through the asset
//! protocol, scoped to this directory only. Phase 5 zips a workspace into a `.stvd` bundle.

use crate::error::{AppError, AppResult};
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Largest single asset accepted from the webview (a 2-3 M triangle budget is the whole scene).
pub const MAX_ASSET_BYTES: usize = 512 * 1024 * 1024;

pub struct Workspace {
    root: PathBuf,
}

/// A content address: lowercase hex SHA-256 (the frontend `AssetIdSchema`).
pub fn is_asset_id(id: &str) -> bool {
    id.len() == 64
        && id
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

impl Workspace {
    /// Creates a fresh workspace under `base` (normally `<app cache>/workspaces`).
    pub fn create(base: &Path) -> AppResult<Self> {
        let millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let root = base.join(format!("ws-{millis}-{}", std::process::id()));
        fs::create_dir_all(root.join("geometry"))?;
        Ok(Self { root })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn geometry_dir(&self) -> PathBuf {
        self.root.join("geometry")
    }

    /// Stores an asset under its content address. The bytes must hash to `id`: the webview
    /// cannot place anything else in the workspace. Returns false if it was already there.
    pub fn write_asset(&self, id: &str, bytes: &[u8]) -> AppResult<bool> {
        if !is_asset_id(id) {
            return Err(AppError::InvalidInput(format!(
                "'{id}' is not an asset id."
            )));
        }
        if bytes.len() > MAX_ASSET_BYTES {
            return Err(AppError::InvalidInput("The asset is too large.".into()));
        }
        if sha256_hex(bytes) != id {
            return Err(AppError::InvalidInput(format!(
                "Asset {id} does not match its content."
            )));
        }
        let path = self.geometry_dir().join(format!("{id}.glb"));
        if path.is_file() {
            return Ok(false); // same address, same bytes
        }
        write_atomic(&path, bytes)?;
        Ok(true)
    }
}

/// Writes through a temporary file in the same directory and renames it into place, so a
/// crash never leaves a half-written file under the final name (Windows and Linux).
pub fn write_atomic(path: &Path, bytes: &[u8]) -> AppResult<()> {
    let dir = path
        .parent()
        .ok_or_else(|| AppError::InvalidInput("The path has no directory.".into()))?;
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let temp = dir.join(format!(".{name}.{}.tmp", std::process::id()));
    {
        let mut file = fs::File::create(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
    }
    fs::rename(&temp, path).inspect_err(|_| {
        let _ = fs::remove_file(&temp);
    })?;
    Ok(())
}

/// Deletes workspaces under `base` whose last change is older than `max_age`, except `keep`.
/// Errors on individual entries are skipped (another instance may be using one).
pub fn clean_stale(base: &Path, max_age: Duration, keep: &Path) -> usize {
    let Ok(entries) = fs::read_dir(base) else {
        return 0;
    };
    let now = SystemTime::now();
    entries
        .flatten()
        .filter(|e| e.path() != keep && e.file_name().to_string_lossy().starts_with("ws-"))
        .filter(|e| {
            e.metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| now.duration_since(t).ok())
                .is_some_and(|age| age > max_age)
        })
        .filter(|e| fs::remove_dir_all(e.path()).is_ok())
        .count()
}

#[cfg(test)]
mod tests;
