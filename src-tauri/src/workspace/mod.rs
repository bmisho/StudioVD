//! Per-project working directory (PLAN 1.1 decision 2, Phases 4.1 and 5). Layout:
//!
//! ```text
//! <app cache>/workspaces/ws-<millis>-<pid>-<n>/
//!   .lock            held while a StudioVD instance uses the workspace
//!   bundle/          the project's files, as in the .stvd (geometry/<sha256>.glb, ...)
//!   autosave.json    unsaved changes (Phase 5.5); its presence makes the folder recoverable
//!   manifest.json    the .stvd it belongs to (written by Rust only)
//! ```
//!
//! The webview loads geometry through the `stvd` URI scheme (`protocol`), which serves
//! `bundle/geometry` only.

pub mod protocol;
pub mod recovery;
pub mod sweep;

use crate::error::{AppError, AppResult};
use crate::fsutil::write_atomic;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// Largest single asset accepted from the webview (a 2-3 M triangle budget is the whole scene).
pub const MAX_ASSET_BYTES: usize = 512 * 1024 * 1024;

const LOCK_FILE: &str = ".lock";
const BUNDLE_DIR: &str = "bundle";
const AUTOSAVE_FILE: &str = "autosave.json";

pub struct Workspace {
    root: PathBuf,
    /// Held while this instance uses the workspace: sweeps and recovery skip locked folders.
    lock: fs::File,
}

/// A content address: lowercase hex SHA-256 (the frontend `AssetIdSchema`).
pub fn is_asset_id(id: &str) -> bool {
    id.len() == 64
        && id
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex(&Sha256::digest(bytes))
}

pub fn hex(digest: &[u8]) -> String {
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// Stores an asset under its content address in `geometry_dir`. The bytes must hash to `id`:
/// the webview cannot place anything else in the workspace. False if it was already there.
pub fn write_asset(geometry_dir: &Path, id: &str, bytes: &[u8]) -> AppResult<bool> {
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
    let path = geometry_dir.join(format!("{id}.glb"));
    if path.is_file() {
        return Ok(false); // same address, same bytes
    }
    write_atomic(&path, bytes)?;
    Ok(true)
}

impl Workspace {
    /// A fresh workspace for a new project: an empty `bundle/geometry`.
    pub fn create(base: &Path) -> AppResult<Self> {
        let ws = Self::create_empty(base)?;
        fs::create_dir_all(ws.geometry_dir())?;
        Ok(ws)
    }

    /// A fresh workspace with no `bundle/` yet: opening a `.stvd` extracts into it.
    pub fn create_empty(base: &Path) -> AppResult<Self> {
        let millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let n = NEXT.fetch_add(1, Ordering::Relaxed);
        let root = base.join(format!("ws-{millis}-{}-{n}", std::process::id()));
        fs::create_dir_all(&root)?;
        let lock = fs::File::create(root.join(LOCK_FILE))?;
        lock.lock()?;
        Ok(Self { root, lock })
    }

    /// Takes over a workspace another (crashed) instance left behind, for crash recovery.
    pub fn adopt(root: &Path) -> AppResult<Self> {
        let lock = fs::OpenOptions::new()
            .write(true)
            .open(root.join(LOCK_FILE))?;
        match lock.try_lock() {
            Ok(()) => Ok(Self {
                root: root.to_path_buf(),
                lock,
            }),
            Err(fs::TryLockError::WouldBlock) => Err(AppError::InvalidInput(
                "This project is open in another StudioVD window.".into(),
            )),
            Err(fs::TryLockError::Error(e)) => Err(e.into()),
        }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// The project's files, laid out as inside the `.stvd`.
    pub fn bundle_dir(&self) -> PathBuf {
        self.root.join(BUNDLE_DIR)
    }

    pub fn geometry_dir(&self) -> PathBuf {
        self.bundle_dir().join("geometry")
    }

    pub fn autosave_path(&self) -> PathBuf {
        self.root.join(AUTOSAVE_FILE)
    }

    /// Done with this workspace (New, Open, exit). Unsaved changes keep it for crash
    /// recovery; otherwise everything in it is in the `.stvd` or was discarded: deleted.
    pub fn release(self) {
        if !self.autosave_path().is_file() {
            self.discard();
        }
    }

    /// Deletes the workspace. The autosave goes first, under the lock, so a half-deleted
    /// folder is never offered for recovery.
    pub fn discard(self) {
        let _ = fs::remove_file(self.autosave_path());
        let root = self.root.clone();
        let _ = self.lock.unlock();
        drop(self);
        let _ = fs::remove_dir_all(root);
    }
}

#[cfg(test)]
mod tests;
