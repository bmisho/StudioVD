//! The `.stvd` project bundle (PLAN §1.3, 5.2): a zip holding `scene.json`, an optional
//! `thumbnail.png`, and the files the scene names, each stored under its own SHA-256:
//! `geometry/<sha256>.glb`, `textures/<sha256>.png|jpg`, `licenses/<sha256>.txt`.
//! The bundle holds exactly the files `scene.json` names (save-time GC, PLAN 5.6).

use super::guard::{extract_zip, inspect_zip, Limits};
use super::writer::{write_zip, Entry, Source};
use crate::error::{AppError, AppResult};
use crate::fsutil::write_atomic_with;
use crate::workspace::{hex, is_asset_id, MAX_ASSET_BYTES};
use serde::Deserialize;
use std::collections::BTreeMap;
use std::fs::{self, File};
use std::path::Path;

pub const SCENE: &str = "scene.json";
pub const THUMBNAIL: &str = "thumbnail.png";
/// The same cap the webview applies (`SCENE_LIMITS.maxBytes`).
pub const MAX_SCENE_BYTES: u64 = 64 * 1024 * 1024;
pub const MAX_THUMBNAIL_BYTES: u64 = 4 * 1024 * 1024;
const PNG_SIGNATURE: &[u8] = b"\x89PNG\r\n\x1a\n";

/// Zip32 only (ZIP64 is refused), so archives stay below 4 GiB.
pub const LIMITS: Limits = Limits {
    max_archive_bytes: u32::MAX as u64,
    max_entries: 15_000,
    max_total_bytes: 8 * 1024 * 1024 * 1024,
    max_ratio: 200,
    ratio_floor_bytes: 1024 * 1024,
    max_name_len: 96,
};

/// The size cap for a content-addressed file name, and the hash it carries.
fn content(name: &str) -> Option<(u64, &str)> {
    let (dir, file) = name.split_once('/')?;
    let (hash, ext) = file.split_once('.')?;
    let cap = match (dir, ext) {
        ("geometry", "glb") => MAX_ASSET_BYTES as u64,
        ("textures", "png" | "jpg") => 64 * 1024 * 1024,
        ("licenses", "txt") => 1024 * 1024,
        _ => return None,
    };
    is_asset_id(hash).then_some((cap, hash))
}

/// Which entries a `.stvd` may hold, and how large each may be.
pub fn entry_rule(name: &str) -> Option<u64> {
    match name {
        SCENE => Some(MAX_SCENE_BYTES),
        THUMBNAIL => Some(MAX_THUMBNAIL_BYTES),
        _ => content(name).map(|(cap, _)| cap),
    }
}

fn damaged(what: &str) -> AppError {
    AppError::InvalidInput(format!(
        "This is not a StudioVD project, or it is damaged: {what}."
    ))
}

/// Extracts a `.stvd` into `dest` (a workspace's `bundle/`, not existing yet) after every
/// guard check; each content file must hash to its name. Returns the extracted names.
pub fn extract(path: &Path, dest: &Path) -> AppResult<Vec<String>> {
    let file = File::open(path)?;
    let extracted = match extract_zip(file, dest, &LIMITS, entry_rule) {
        Ok(extracted) => extracted,
        Err(AppError::InvalidInput(why)) => return Err(damaged(&why)),
        Err(e) => return Err(e),
    };
    let check = || {
        if !extracted.iter().any(|e| e.name == SCENE) {
            return Err(damaged("it has no scene.json"));
        }
        for e in &extracted {
            if content(&e.name).is_some_and(|(_, hash)| hash != hex(&e.sha256)) {
                return Err(damaged(&format!("{} does not match its content", e.name)));
            }
        }
        fs::create_dir_all(dest.join("geometry"))?;
        Ok(())
    };
    check().inspect_err(|_| {
        let _ = fs::remove_dir_all(dest);
    })?;
    Ok(extracted.into_iter().map(|e| e.name).collect())
}

#[derive(Deserialize)]
struct PathRef {
    path: String,
}

/// Only the parts of scene.json that name files. The webview validated the rest.
#[derive(Deserialize)]
struct SceneFiles {
    assets: BTreeMap<String, PathRef>,
    textures: BTreeMap<String, PathRef>,
    #[serde(rename = "licenseTexts")]
    license_texts: BTreeMap<String, PathRef>,
}

/// The files a scene names, sorted, each with the SHA-256 it must have. Every path must be
/// `<dir>/<record key>.<ext>`: the webview cannot make Rust read any other file.
pub fn referenced_files(scene: &[u8]) -> AppResult<Vec<(String, [u8; 32])>> {
    let files: SceneFiles = serde_json::from_slice(scene)
        .map_err(|e| AppError::InvalidInput(format!("scene.json is not valid: {e}")))?;
    let mut out = Vec::new();
    for (key, entry) in files
        .assets
        .iter()
        .chain(&files.textures)
        .chain(&files.license_texts)
    {
        let named = content(&entry.path).is_some_and(|(_, hash)| hash == key);
        let Some(sha256) = named.then(|| parse_sha256(key)).flatten() else {
            return Err(AppError::InvalidInput(format!(
                "scene.json names an invalid file: {}",
                entry.path
            )));
        };
        out.push((entry.path.clone(), sha256));
    }
    out.sort();
    Ok(out)
}

fn parse_sha256(hex: &str) -> Option<[u8; 32]> {
    let mut out = [0u8; 32];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(hex.get(2 * i..2 * i + 2)?, 16).ok()?;
    }
    Some(out)
}

/// Writes the project in `bundle_dir` to `target` atomically: `scene`, the thumbnail (or
/// the one the bundle already has), and every file the scene names, re-hashed on the way.
/// The finished archive is re-read structurally before it replaces anything.
pub fn write(
    bundle_dir: &Path,
    scene: &[u8],
    thumbnail: Option<&[u8]>,
    target: &Path,
) -> AppResult<()> {
    if scene.len() as u64 > MAX_SCENE_BYTES {
        return Err(AppError::InvalidInput(
            "The project is too large to save.".into(),
        ));
    }
    let kept;
    let thumbnail = match thumbnail {
        Some(png) => Some(png),
        None => {
            kept = fs::read(bundle_dir.join(THUMBNAIL)).ok();
            kept.as_deref()
        }
    }
    .filter(|png| png.starts_with(PNG_SIGNATURE) && png.len() as u64 <= MAX_THUMBNAIL_BYTES);
    let mut entries = vec![Entry {
        name: SCENE.into(),
        source: Source::Bytes(scene),
        compress: true,
    }];
    if let Some(png) = thumbnail {
        entries.push(Entry {
            name: THUMBNAIL.into(),
            source: Source::Bytes(png),
            compress: false,
        });
    }
    for (name, sha256) in referenced_files(scene)? {
        let compress = !(name.ends_with(".png") || name.ends_with(".jpg"));
        let path = bundle_dir.join(&name);
        entries.push(Entry {
            name,
            source: Source::File { path, sha256 },
            compress,
        });
    }
    write_atomic_with(target, |file| {
        write_zip(file, &entries, LIMITS.max_name_len)?;
        inspect_zip(&mut *file, &LIMITS, entry_rule).map_err(|e| {
            AppError::Io(format!(
                "The saved file did not check out ({e}); nothing was replaced."
            ))
        })?;
        Ok(())
    })
}
