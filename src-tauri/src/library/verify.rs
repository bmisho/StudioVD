//! What a staged pack's files must be before they reach the store, and where they go.

use super::glb::check_glb;
use super::packfile::{file_kind, FileKind};
use crate::error::{AppError, AppResult};
use crate::workspace::texture::{check_texture, image_header, ImageKind};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

fn bad<T>(reason: impl Into<String>) -> AppResult<T> {
    Err(AppError::InvalidInput(reason.into()))
}

/// Each file is what its name says: GLB without outside data, PNG/JPEG within the texture
/// limits (thumbnails at most 512 px), UTF-8 licence text and manifest JSON.
pub fn check_content(path: &Path, name: &str) -> AppResult<()> {
    let bytes = fs::read(path)?;
    match file_kind(name).map(|(kind, _)| kind) {
        Some(FileKind::Geometry) => check_glb(&bytes),
        Some(FileKind::Texture) => check_texture(&bytes).map(|_| ()),
        Some(FileKind::Thumbnail) => match image_header(&bytes) {
            Some((ImageKind::Png, w, h)) if w <= 512 && h <= 512 => Ok(()),
            _ => bad(format!("{name} is not a PNG of at most 512 px")),
        },
        Some(FileKind::License) => std::str::from_utf8(&bytes)
            .map(|_| ())
            .or_else(|_| bad(format!("{name} is not UTF-8 text"))),
        Some(FileKind::Manifest) => serde_json::from_slice::<serde_json::Value>(&bytes)
            .map(|_| ())
            .or_else(|_| bad(format!("{name} is not JSON"))),
        None => bad(format!("{name} is not a file a pack may hold")),
    }
}

/// Where a pack file goes in the store: its own path, thumbnails by their hash.
pub fn store_path(path: &str, sha256: &str) -> Option<String> {
    match file_kind(path)?.0 {
        FileKind::Manifest => None,
        FileKind::Thumbnail => Some(format!("thumbnails/{sha256}.png")),
        _ => Some(path.to_owned()),
    }
}

/// The store blobs a manifest names: every string in it that is one of the pack's files.
pub fn referenced(manifest: &serde_json::Value, by_path: &HashMap<&str, &str>) -> Vec<String> {
    let mut out = Vec::new();
    let mut stack = vec![manifest];
    while let Some(v) = stack.pop() {
        match v {
            serde_json::Value::String(s) => {
                if let Some(blob) = by_path.get(s.as_str()).and_then(|sha| store_path(s, sha)) {
                    out.push(blob);
                }
            }
            serde_json::Value::Array(items) => stack.extend(items),
            serde_json::Value::Object(map) => stack.extend(map.values()),
            _ => {}
        }
    }
    out.sort();
    out.dedup();
    out
}
