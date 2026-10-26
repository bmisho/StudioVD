//! What is installed: one `install.json` per component (the record of truth) and the
//! `installed.json` index rebuilt from them whenever it is missing or unreadable.

use super::Library;
use crate::error::AppResult;
use crate::fsutil::write_atomic;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Origin {
    /// From a pack verified against a signed catalog (Phase 14).
    Official,
    /// Saved from a project by the user (Phase 9.7).
    User,
    /// From an unsigned pack the user chose to install ("Unverified").
    Sideloaded,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct InstalledComponent {
    pub id: String,
    pub version: String,
    pub manifest_sha256: String,
    pub origin: Origin,
    /// SHA-256 of the `.stvdpack` it came from.
    pub pack_sha256: Option<String>,
    /// Seconds since 1970 (UTC).
    pub installed_at: u64,
    /// The store blobs its manifest names (`geometry/<sha>.glb`, `thumbnails/<sha>.png`...).
    pub blobs: Vec<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Index {
    format: String,
    components: Vec<InstalledComponent>,
}

const FORMAT: &str = "studiovd-installed-1";

/// The installed components, sorted by id then version: the index, or a rebuild of it.
pub fn load(lib: &Library) -> Vec<InstalledComponent> {
    let read = fs::read(lib.installed_path())
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Index>(&bytes).ok())
        .filter(|index| index.format == FORMAT);
    match read {
        Some(index) => index.components,
        None => rebuild(lib),
    }
}

/// Every `components/<ns>/<slug>/<version>/install.json` that reads back.
pub fn rebuild(lib: &Library) -> Vec<InstalledComponent> {
    let mut found = Vec::new();
    let dirs = |dir: &Path| -> Vec<std::path::PathBuf> {
        fs::read_dir(dir)
            .map(|entries| {
                entries
                    .flatten()
                    .map(|e| e.path())
                    .filter(|p| p.is_dir())
                    .collect()
            })
            .unwrap_or_default()
    };
    for ns in dirs(&lib.components_dir()) {
        for slug in dirs(&ns) {
            for version in dirs(&slug) {
                let record = fs::read(version.join("install.json"))
                    .ok()
                    .and_then(|b| serde_json::from_slice::<InstalledComponent>(&b).ok());
                if let Some(record) = record {
                    found.push(record);
                }
            }
        }
    }
    sort(&mut found);
    found
}

fn sort(list: &mut [InstalledComponent]) {
    list.sort_by(|a, b| (&a.id, &a.version).cmp(&(&b.id, &b.version)));
}

/// Writes the index (callers hold the write lock).
pub fn save(lib: &Library, components: &mut [InstalledComponent]) -> AppResult<()> {
    sort(components);
    let index = Index {
        format: FORMAT.into(),
        components: components.to_vec(),
    };
    let json =
        serde_json::to_vec_pretty(&index).map_err(|e| crate::error::AppError::Io(e.to_string()))?;
    write_atomic(&lib.installed_path(), &json)
}

/// Writes one component's record (callers hold the write lock).
pub fn write_record(lib: &Library, record: &InstalledComponent) -> AppResult<()> {
    let dir = lib.component_dir(&record.id, &record.version);
    let json =
        serde_json::to_vec_pretty(record).map_err(|e| crate::error::AppError::Io(e.to_string()))?;
    write_atomic(&dir.join("install.json"), &json)
}
