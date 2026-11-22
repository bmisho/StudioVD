//! Catalog thumbnails (PLAN 4.4, 14.5): preview packs are zips of PNGs at the paths the index
//! gives each component's thumbnail. Each is checked against the index's SHA-256 and stored by
//! it in `catalogs/thumbs/` (served as `stvd://localhost/cat-<sha256>.png`), apart from the
//! store, whose collector keeps only what installed components name.

use super::meta::IndexMeta;
use crate::bundle::guard::{extract_zip, Limits};
use crate::error::AppResult;
use crate::library::Library;
use crate::workspace::hex;
use crate::workspace::texture::{image_header, ImageKind};
use std::collections::HashMap;
use std::fs;
use std::io::BufReader;
use std::path::{Path, PathBuf};

const MIB: u64 = 1024 * 1024;
/// A thumbnail is at most 512 px a side and this many bytes.
pub const MAX_THUMBNAIL_BYTES: u64 = 512 * 1024;
const PREVIEW_LIMITS: Limits = Limits {
    max_archive_bytes: 64 * MIB,
    max_entries: 20_001,
    max_total_bytes: 128 * MIB,
    max_ratio: 100,
    ratio_floor_bytes: 16 * MIB,
    max_name_len: 200,
};

pub fn thumbs_dir(lib: &Library) -> PathBuf {
    lib.root().join("catalogs").join("thumbs")
}

/// The thumbnails of `pack` the index lists, by path → SHA-256.
fn wanted<'a>(meta: &'a IndexMeta, pack: &str) -> HashMap<&'a str, &'a str> {
    meta.components
        .iter()
        .filter(|c| c.thumbnail.pack == pack)
        .map(|c| (c.thumbnail.path.as_str(), c.thumbnail.sha256.as_str()))
        .collect()
}

/// Whether every thumbnail `pack` holds is stored already (no download needed).
pub fn complete(lib: &Library, meta: &IndexMeta, pack: &str) -> bool {
    let dir = thumbs_dir(lib);
    wanted(meta, pack)
        .values()
        .all(|sha| dir.join(format!("{sha}.png")).is_file())
}

/// Stores the listed thumbnails of a downloaded preview pack; returns how many were new.
/// Entries the index does not list, or that do not match it, are skipped.
pub fn install(lib: &Library, archive: &Path, meta: &IndexMeta, pack: &str) -> AppResult<usize> {
    let tmp = lib
        .staging_dir()
        .join(format!("previews-{}", &pack[..pack.len().min(16)]));
    let _ = fs::remove_dir_all(&tmp);
    let rule = |name: &str| name.ends_with(".png").then_some(MAX_THUMBNAIL_BYTES);
    let reader = BufReader::new(fs::File::open(archive)?);
    let extracted = extract_zip(reader, &tmp, &PREVIEW_LIMITS, rule)?;
    let want = wanted(meta, pack);
    let out = thumbs_dir(lib);
    fs::create_dir_all(&out)?;
    let mut added = 0;
    for e in &extracted {
        let Some(sha) = want.get(e.name.as_str()) else {
            continue;
        };
        if hex(&e.sha256) != *sha {
            continue;
        }
        let from = tmp.join(&e.name);
        let png = fs::read(&from)?;
        if !matches!(image_header(&png), Some((ImageKind::Png, w, h)) if w <= 512 && h <= 512) {
            continue;
        }
        let to = out.join(format!("{sha}.png"));
        if !to.is_file() {
            fs::write(&to, &png)?;
            added += 1;
        }
    }
    let _ = fs::remove_dir_all(&tmp);
    Ok(added)
}
