//! The verified catalog index on disk (PLAN 4.4, 4.5): `catalogs/<id>/index.json`, its
//! `.minisig`, and `state.json` with the highest sequence ever verified (the rollback guard
//! outlives a deleted or replaced index). Re-verified on every read.

use super::meta::{iso_secs, version_at_least, IndexMeta};
use super::signed::{verify_index, MAX_INDEX_BYTES, MAX_SIGNATURE_BYTES};
use super::source::CatalogSource;
use crate::error::{AppError, AppResult};
use crate::fsutil::write_atomic;
use crate::library::Library;
use crate::picked::read_capped;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct State {
    highest_sequence: u64,
    fetched_at: u64,
}

pub struct Cached {
    pub index: Vec<u8>,
    pub meta: IndexMeta,
    pub fetched_at: u64,
}

impl Cached {
    /// Past its `expiresAt`: browsing still works, installing needs a refresh first.
    pub fn expired(&self, now: u64) -> bool {
        iso_secs(&self.meta.expires_at).is_none_or(|t| t <= now)
    }
}

pub fn dir(lib: &Library, source: &CatalogSource) -> PathBuf {
    lib.root().join("catalogs").join(source.id)
}

fn read_state(lib: &Library, source: &CatalogSource) -> State {
    fs::read(dir(lib, source).join("state.json"))
        .ok()
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

/// The cached index, if one is there and still verifies.
pub fn load(lib: &Library, source: &CatalogSource) -> Option<Cached> {
    let d = dir(lib, source);
    let index = read_capped(&d.join("index.json"), MAX_INDEX_BYTES as u64).ok()?;
    let sig = read_capped(&d.join("index.json.minisig"), MAX_SIGNATURE_BYTES as u64).ok()?;
    let meta = verify_index(&index, &sig, source.keys).ok()?;
    (meta.catalog_id == source.id).then(|| Cached {
        index,
        meta,
        fetched_at: read_state(lib, source).fetched_at,
    })
}

fn refused<T>(reason: String) -> AppResult<T> {
    Err(AppError::InvalidInput(format!(
        "The catalog index was refused: {reason}."
    )))
}

/// Checks a downloaded index and, when it is acceptable, makes it the cached one. Returns
/// its meta and whether it differs from what was cached.
pub fn accept(
    lib: &Library,
    source: &CatalogSource,
    index: &[u8],
    sig: &[u8],
    now: u64,
    app_version: &str,
) -> AppResult<(IndexMeta, bool)> {
    let meta = verify_index(index, sig, source.keys)?;
    if meta.catalog_id != source.id {
        return refused(format!("it is the '{}' catalog", meta.catalog_id));
    }
    if iso_secs(&meta.expires_at).is_none_or(|t| t <= now) {
        return refused("it has expired (the server may be serving a frozen copy)".into());
    }
    if !version_at_least(app_version, &meta.min_app_version) {
        return Err(AppError::InvalidInput(format!(
            "The catalog needs StudioVD {} or later; the cached catalog stays in use.",
            meta.min_app_version
        )));
    }
    let state = read_state(lib, source);
    if meta.sequence < state.highest_sequence {
        return refused(format!(
            "it is older (#{}) than one already seen (#{})",
            meta.sequence, state.highest_sequence
        ));
    }
    let previous = load(lib, source);
    if meta.sequence == state.highest_sequence {
        if let Some(prev) = &previous {
            if prev.index != index {
                return refused("another index was published with the same sequence".into());
            }
        }
    }
    let changed = previous.is_none_or(|p| p.index != index);
    let d = dir(lib, source);
    fs::create_dir_all(&d)?;
    let lock = lib.lock()?;
    write_atomic(&d.join("index.json"), index)?;
    write_atomic(&d.join("index.json.minisig"), sig)?;
    let state = State {
        highest_sequence: meta.sequence,
        fetched_at: now,
    };
    let json = serde_json::to_vec(&state).map_err(|e| AppError::Io(e.to_string()))?;
    write_atomic(&d.join("state.json"), &json)?;
    drop(lock);
    Ok((meta, changed))
}
