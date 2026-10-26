//! Insertion (PLAN 4.6): a component's geometry, textures and licence texts are copied from
//! the store into the project workspace, so a `.stvd` never needs the library. Files already
//! there (same content address) are skipped; every copy is re-hashed on the way.

use super::installed::InstalledComponent;
use super::Library;
use crate::error::{AppError, AppResult};
use crate::fsutil::write_atomic;
use crate::workspace::sha256_hex;
use std::fs;
use std::path::Path;

/// Copies the component's blobs into `bundle_dir` (geometry/, textures/, licenses/); returns
/// how many files were new there. Thumbnails stay in the library.
pub fn copy_into_project(
    lib: &Library,
    c: &InstalledComponent,
    bundle_dir: &Path,
) -> AppResult<usize> {
    let mut copied = 0;
    for blob in &c.blobs {
        let Some((folder, name)) = blob.split_once('/') else {
            continue;
        };
        if !matches!(folder, "geometry" | "textures" | "licenses") {
            continue;
        }
        let dest = bundle_dir.join(folder).join(name);
        if dest.is_file() {
            continue;
        }
        let bytes = fs::read(lib.store_dir().join(blob))?;
        let sha = name.split('.').next().unwrap_or_default();
        if sha256_hex(&bytes) != sha {
            return Err(AppError::Io(format!(
                "The library file {blob} is damaged; reinstall {}.",
                c.id
            )));
        }
        fs::create_dir_all(bundle_dir.join(folder))?;
        write_atomic(&dest, &bytes)?;
        copied += 1;
    }
    Ok(copied)
}
