//! The local component library (PLAN 4.5, 9.2). Rust writes it, the webview reads it through
//! commands and the `stvd` scheme (`/lib-<sha256>.<ext>`). Layout under
//! `appLocalDataDir/library/`:
//!
//! ```text
//! LOCK                      held while anything writes here (one writer at a time)
//! installed.json            index of installed components (rebuilt from components/ if lost)
//! publisher.json            this installation's namespace for the user's own components
//! store/<kind>/<sha256>.<ext>   content-addressed blobs: geometry, textures, licenses, thumbnails
//! components/<ns>/<slug>/<version>/component.json   the manifest, byte for byte
//! components/<ns>/<slug>/<version>/install.json     origin and the blobs it uses
//! staging/<token>/          a pack being installed (swept at startup)
//! catalogs/                 signed catalog indexes (Phase 14)
//! ```

pub mod commit;
pub mod copy;
pub mod export;
pub mod from_project;
pub mod gc;
pub mod glb;
pub mod install;
pub mod installed;
pub mod packfile;
pub mod publisher;
mod verify;

use crate::error::AppResult;
use std::fs;
use std::path::{Path, PathBuf};

/// The kinds of blob the store holds, by folder and extension.
pub const BLOB_FOLDERS: [&str; 4] = ["geometry", "textures", "licenses", "thumbnails"];

pub struct Library {
    root: PathBuf,
}

/// Held while writing: the library's `LOCK` file, locked exclusively, released on drop.
pub struct WriteLock(fs::File);

impl Drop for WriteLock {
    fn drop(&mut self) {
        let _ = self.0.unlock();
    }
}

impl Library {
    /// Opens (creating as needed) the library at `root`, sweeping staging leftovers of an
    /// install that was interrupted.
    pub fn open(root: &Path) -> AppResult<Self> {
        let lib = Self {
            root: root.to_path_buf(),
        };
        for folder in BLOB_FOLDERS {
            fs::create_dir_all(lib.store_dir().join(folder))?;
        }
        fs::create_dir_all(lib.components_dir())?;
        fs::create_dir_all(lib.root.join("catalogs"))?;
        let staging = lib.staging_dir();
        if staging.is_dir() {
            let lock = lib.lock()?;
            let _ = fs::remove_dir_all(&staging);
            drop(lock);
        }
        fs::create_dir_all(staging)?;
        Ok(lib)
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn publisher_path(&self) -> PathBuf {
        self.root.join("publisher.json")
    }

    pub fn store_dir(&self) -> PathBuf {
        self.root.join("store")
    }

    pub fn components_dir(&self) -> PathBuf {
        self.root.join("components")
    }

    pub fn staging_dir(&self) -> PathBuf {
        self.root.join("staging")
    }

    pub fn installed_path(&self) -> PathBuf {
        self.root.join("installed.json")
    }

    /// Where one component's files live: `components/<ns>/<slug>/<version>`. The id and
    /// version were checked by `packfile::check_component_id` before they get here.
    pub fn component_dir(&self, id: &str, version: &str) -> PathBuf {
        let mut dir = self.components_dir();
        for part in id.split('/') {
            dir.push(part);
        }
        dir.join(version)
    }

    /// Waits for, then takes, the single-writer lock.
    pub fn lock(&self) -> AppResult<WriteLock> {
        let file = fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .open(self.root.join("LOCK"))?;
        file.lock()?;
        Ok(WriteLock(file))
    }
}

#[cfg(test)]
mod tests;
