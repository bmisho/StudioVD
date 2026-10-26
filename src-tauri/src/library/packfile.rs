//! `pack.json`, read strictly (PLAN 4.4): the same rules as the webview's `PackManifestSchema`
//! (`src/core/schema/component/pack.ts`), checked here before a pack is installed. Both are
//! tested against the same fixture.

use crate::error::{AppError, AppResult};
use crate::workspace::is_asset_id;
use serde::Deserialize;
use std::collections::HashSet;

const MIB: u64 = 1024 * 1024;
/// Largest `pack.json`.
pub const MAX_PACK_JSON_BYTES: u64 = 4 * MIB;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileKind {
    Manifest,
    Thumbnail,
    Geometry,
    Texture,
    License,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct PackManifest {
    pub format: String,
    pub schema_version: u32,
    pub created_by: String,
    pub created_at: String,
    pub components: Vec<PackComponent>,
    pub files: Vec<PackFile>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct PackComponent {
    pub id: String,
    pub version: String,
    pub manifest_path: String,
    pub manifest_sha256: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PackFile {
    pub path: String,
    pub sha256: String,
    pub bytes: u64,
}

fn bad<T>(reason: impl Into<String>) -> AppResult<T> {
    Err(AppError::InvalidInput(format!(
        "The pack is not valid: {}.",
        reason.into()
    )))
}

/// `<namespace>/<slug>` as the webview's `ComponentIdSchema` reads it.
pub fn check_component_id(id: &str) -> bool {
    let Some((ns, slug)) = id.split_once('/') else {
        return false;
    };
    let ns_ok = (2..=32).contains(&ns.len())
        && ns.as_bytes()[0].is_ascii_lowercase()
        && ns
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-');
    let slug_ok = (1..=64).contains(&slug.len())
        && (slug.as_bytes()[0].is_ascii_lowercase() || slug.as_bytes()[0].is_ascii_digit())
        && slug.bytes().all(|b| {
            b.is_ascii_lowercase() || b.is_ascii_digit() || matches!(b, b'.' | b'_' | b'-')
        });
    ns_ok && slug_ok
}

/// A version as a path segment: SemVer characters only (the webview checks the grammar).
pub fn check_version(version: &str) -> bool {
    (5..=64).contains(&version.len())
        && version.as_bytes()[0].is_ascii_digit()
        && version
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-'))
        && !version.contains("..")
}

/// What a pack path holds and its size cap, or None for a path no pack may hold.
pub fn file_kind(path: &str) -> Option<(FileKind, u64)> {
    let parts: Vec<&str> = path.split('/').collect();
    let named = |file: &str, ext: &str| file.strip_suffix(ext).is_some_and(is_asset_id);
    match parts.as_slice() {
        ["components", _, _, _, "component.json"] => Some((FileKind::Manifest, 4 * MIB)),
        ["components", _, _, _, png] if png.ends_with(".png") && thumb_name(png) => {
            Some((FileKind::Thumbnail, MIB))
        }
        ["geometry", f] if named(f, ".glb") => Some((FileKind::Geometry, 64 * MIB)),
        ["textures", f] if named(f, ".png") || named(f, ".jpg") => {
            Some((FileKind::Texture, 16 * MIB))
        }
        ["licenses", f] if named(f, ".txt") => Some((FileKind::License, MIB)),
        _ => None,
    }
}

fn thumb_name(file: &str) -> bool {
    let stem = file.trim_end_matches(".png");
    (1..=32).contains(&stem.len())
        && stem
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// Parses and checks `pack.json`: format, counts, file kinds and caps, content-addressed
/// names, no path listed twice (case-insensitively), each component's manifest listed at
/// `components/<id>/<version>/component.json` with its hash.
pub fn parse_pack_manifest(bytes: &[u8]) -> AppResult<PackManifest> {
    if bytes.len() as u64 > MAX_PACK_JSON_BYTES {
        return bad("pack.json is too large");
    }
    let pack: PackManifest = serde_json::from_slice(bytes).or_else(|e| bad(e.to_string()))?;
    if pack.format != "studiovd-pack" || pack.schema_version != 1 {
        return bad("not a StudioVD pack of format 1");
    }
    let stamp = &pack.created_at;
    if pack.created_by.is_empty()
        || pack.created_by.len() > 80
        || !stamp.ends_with('Z')
        || stamp.len() > 24
    {
        return bad("createdBy or createdAt is malformed");
    }
    if pack.components.is_empty() || pack.components.len() > 1000 {
        return bad("it must list 1 to 1000 components");
    }
    if pack.files.is_empty() || pack.files.len() > 20_000 {
        return bad("it must list 1 to 20000 files");
    }
    let mut paths = HashSet::new();
    for f in &pack.files {
        let Some((kind, cap)) = file_kind(&f.path) else {
            return bad(format!("{:?} is not a file a pack may hold", f.path));
        };
        if !is_asset_id(&f.sha256) || f.bytes > cap {
            return bad(format!("{:?} has a bad hash or is too large", f.path));
        }
        let named = !matches!(kind, FileKind::Manifest | FileKind::Thumbnail);
        if named && !f.path.contains(&f.sha256) {
            return bad(format!("{:?} is not named by its SHA-256", f.path));
        }
        if !paths.insert(f.path.to_ascii_lowercase()) {
            return bad(format!("{:?} is listed twice", f.path));
        }
    }
    let mut seen = HashSet::new();
    for c in &pack.components {
        if !check_component_id(&c.id) || !check_version(&c.version) {
            return bad(format!("{:?} is not a component id and version", c.id));
        }
        if !seen.insert(format!("{}@{}", c.id, c.version)) {
            return bad(format!("{}@{} is listed twice", c.id, c.version));
        }
        let expected = format!("components/{}/{}/component.json", c.id, c.version);
        let listed = pack
            .files
            .iter()
            .any(|f| f.path == expected && f.sha256 == c.manifest_sha256);
        if c.manifest_path != expected || !listed {
            return bad(format!(
                "{}'s manifest is not listed where it must be",
                c.id
            ));
        }
    }
    Ok(pack)
}
