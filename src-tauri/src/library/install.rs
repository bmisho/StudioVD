//! Install from file (PLAN 9.2): a `.stvdpack` is extracted into `staging/<token>` through the
//! strict zip guard and checked against its `pack.json`, each file by kind. The webview then
//! validates every component.json (zod) and the user confirms (an unsigned pack is
//! "Unverified"); `commit` moves the blobs into the store and records each component.

use super::installed::Origin;
use super::packfile::{file_kind, parse_pack_manifest, PackManifest, MAX_PACK_JSON_BYTES};
use super::verify::check_content;
use super::Library;
use crate::bundle::guard::{extract_zip, Limits};
use crate::error::{AppError, AppResult};
use crate::workspace::hex;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};

const MIB: u64 = 1024 * 1024;
const PACK_LIMITS: Limits = Limits {
    max_archive_bytes: 512 * MIB,
    max_entries: 20_001,
    max_total_bytes: 2048 * MIB,
    max_ratio: 100,
    ratio_floor_bytes: 64 * MIB,
    max_name_len: 200,
};
/// Namespaces only signed catalogs may install (PLAN 4.7).
const RESERVED: [&str; 4] = ["official", "gen", "builtin", "studiovd"];

/// A pack extracted and checked, waiting for the user's confirmation.
pub struct Staged {
    pub token: String,
    pub(super) dir: PathBuf,
    pub(super) pack: PackManifest,
    pub(super) pack_sha256: String,
    pub(super) origin: Origin,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedComponent {
    pub id: String,
    pub version: String,
    pub manifest_sha256: String,
    /// The component.json text, for the webview's validation and the confirmation.
    pub manifest: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedSummary {
    pub token: String,
    pub components: Vec<StagedComponent>,
    pub files: usize,
    pub bytes: u64,
    /// False for Install from file: no signature vouches for it.
    pub verified: bool,
}

fn bad<T>(reason: impl Into<String>) -> AppResult<T> {
    Err(AppError::InvalidInput(reason.into()))
}

fn token(archive: &Path) -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let seed = format!("{nanos}:{}:{}", std::process::id(), archive.display());
    hex(&Sha256::digest(seed.as_bytes()))[..32].to_owned()
}

fn hash_file(path: &Path) -> AppResult<String> {
    let mut reader = BufReader::new(fs::File::open(path)?);
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 {
            return Ok(hex(&hasher.finalize()));
        }
        hasher.update(&buf[..n]);
    }
}

/// Extracts and checks an unsigned pack (Install from file).
pub fn stage_pack(lib: &Library, archive: &Path) -> AppResult<(Staged, StagedSummary)> {
    let token = token(archive);
    let dir = lib.staging_dir().join(&token);
    let rule = |name: &str| match name {
        "pack.json" => Some(MAX_PACK_JSON_BYTES),
        _ => file_kind(name).map(|(_, cap)| cap),
    };
    let reader = BufReader::new(fs::File::open(archive)?);
    let extracted = extract_zip(reader, &dir, &PACK_LIMITS, rule)?;
    let checked = (|| {
        let pack = parse_pack_manifest(&fs::read(dir.join("pack.json"))?)?;
        let listed: HashMap<&str, (&str, u64)> = pack
            .files
            .iter()
            .map(|f| (f.path.as_str(), (f.sha256.as_str(), f.bytes)))
            .collect();
        let mut seen = 0usize;
        for e in extracted.iter().filter(|e| e.name != "pack.json") {
            let size = fs::metadata(dir.join(&e.name))?.len();
            match listed.get(e.name.as_str()) {
                Some((sha, bytes)) if *sha == hex(&e.sha256) && *bytes == size => seen += 1,
                Some(_) => return bad(format!("{} does not match pack.json", e.name)),
                None => return bad(format!("{} is not listed in pack.json", e.name)),
            }
        }
        if seen != pack.files.len() {
            return bad("pack.json lists files the pack does not hold");
        }
        for f in &pack.files {
            check_content(&dir.join(&f.path), &f.path)?;
        }
        for c in &pack.components {
            let ns = c.id.split('/').next().unwrap_or_default();
            if RESERVED.contains(&ns) {
                return bad(format!(
                    "{} uses a namespace reserved for signed catalogs",
                    c.id
                ));
            }
        }
        Ok(pack)
    })();
    let pack = match checked {
        Ok(pack) => pack,
        Err(e) => {
            let _ = fs::remove_dir_all(&dir);
            return Err(e);
        }
    };
    let components = pack
        .components
        .iter()
        .map(|c| {
            let text = fs::read_to_string(dir.join(&c.manifest_path))?;
            Ok(StagedComponent {
                id: c.id.clone(),
                version: c.version.clone(),
                manifest_sha256: c.manifest_sha256.clone(),
                manifest: text,
            })
        })
        .collect::<AppResult<Vec<_>>>()?;
    let summary = StagedSummary {
        token: token.clone(),
        components,
        files: pack.files.len(),
        bytes: pack.files.iter().map(|f| f.bytes).sum(),
        verified: false,
    };
    let pack_sha256 = hash_file(archive)?;
    Ok((
        Staged {
            token,
            dir,
            pack,
            pack_sha256,
            origin: Origin::Sideloaded,
        },
        summary,
    ))
}
