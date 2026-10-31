//! Export pack (PLAN 9.7): installed components written as an unsigned `.stvdpack`, in the
//! format Install from file reads (`pack.json` listing every file with its SHA-256 and
//! size). The archive is deterministic and re-read through the zip guard before it replaces
//! anything; whoever installs it gets an "Unverified" pack.

use super::install::{pack_entry_rule, PACK_LIMITS};
use super::installed::{self, InstalledComponent};
use super::packfile::{file_kind, MAX_PACK_JSON_BYTES};
use super::Library;
use crate::bundle::guard::inspect_zip;
use crate::bundle::writer::{write_zip, Entry, Source};
use crate::error::{AppError, AppResult};
use crate::fsutil::write_atomic_with;
use crate::workspace::sha256_hex;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ExportSummary {
    pub components: usize,
    pub files: usize,
    pub bytes: u64,
}

fn bad<T>(reason: impl Into<String>) -> AppResult<T> {
    Err(AppError::InvalidInput(reason.into()))
}

/// `2026-10-31T13:05:00Z` for seconds since 1970 (civil-from-days, H. Hinnant).
pub fn iso_utc(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}

struct PackFile {
    source: PathBuf,
    sha256: String,
    bytes: u64,
}

fn parse_sha(hex: &str) -> Option<[u8; 32]> {
    let mut out = [0u8; 32];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(hex.get(2 * i..2 * i + 2)?, 16).ok()?;
    }
    Some(out)
}

/// The pack files one component brings: its blobs at their pack paths (thumbnails where its
/// manifest names them), checked against their content addresses.
fn component_files(
    lib: &Library,
    c: &InstalledComponent,
    manifest: &Value,
    out: &mut BTreeMap<String, PackFile>,
) -> AppResult<()> {
    let thumbs: BTreeMap<&str, &str> = manifest
        .get("thumbnails")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|t| Some((t.get("sha256")?.as_str()?, t.get("path")?.as_str()?)))
        .collect();
    for blob in &c.blobs {
        let (folder, name) = blob.split_once('/').unwrap_or_default();
        let sha = name.split('.').next().unwrap_or_default().to_owned();
        let pack_path = match folder {
            "thumbnails" => match thumbs.get(sha.as_str()) {
                Some(path) => (*path).to_owned(),
                None => continue,
            },
            _ => blob.clone(),
        };
        if file_kind(&pack_path).is_none() || parse_sha(&sha).is_none() {
            return bad(format!("{} names a file a pack cannot hold.", c.id));
        }
        let source = lib.store_dir().join(blob);
        let bytes = fs::metadata(&source)
            .map(|m| m.len())
            .or_else(|_| bad(format!("The library lost {blob}; reinstall {}.", c.id)))?;
        out.insert(
            pack_path,
            PackFile {
                source,
                sha256: sha,
                bytes,
            },
        );
    }
    Ok(())
}

/// Writes the components `refs` (id, version) to `target` as one pack.
pub fn export_pack(
    lib: &Library,
    refs: &[(String, String)],
    target: &Path,
    now: u64,
    app_version: &str,
) -> AppResult<ExportSummary> {
    if refs.is_empty() || refs.len() > 1000 {
        return bad("Choose 1 to 1000 components to export.");
    }
    let all = installed::load(lib);
    let mut manifests = Vec::new();
    let mut files = BTreeMap::new();
    for (id, version) in refs {
        let Some(c) = all.iter().find(|c| &c.id == id && &c.version == version) else {
            return bad(format!("{id} {version} is not installed."));
        };
        let text = fs::read(lib.component_dir(id, version).join("component.json"))?;
        if sha256_hex(&text) != c.manifest_sha256 {
            return bad(format!("{id}'s manifest is damaged; reinstall it."));
        }
        let manifest: Value = serde_json::from_slice(&text).or_else(|_| bad("manifest"))?;
        component_files(lib, c, &manifest, &mut files)?;
        manifests.push((c, text));
    }
    manifests.sort_by(|a, b| (&a.0.id, &a.0.version).cmp(&(&b.0.id, &b.0.version)));
    manifests.dedup_by(|a, b| a.0.id == b.0.id && a.0.version == b.0.version);
    let manifest_path =
        |c: &InstalledComponent| format!("components/{}/{}/component.json", c.id, c.version);
    let mut listed: Vec<Value> = files
        .iter()
        .map(|(path, f)| json!({ "path": path, "sha256": f.sha256, "bytes": f.bytes }))
        .collect();
    for (c, text) in &manifests {
        listed.push(json!({
            "path": manifest_path(c), "sha256": c.manifest_sha256, "bytes": text.len()
        }));
    }
    listed.sort_by(|a, b| a["path"].as_str().cmp(&b["path"].as_str()));
    let pack = json!({
        "format": "studiovd-pack",
        "schemaVersion": 1,
        "createdBy": format!("StudioVD {app_version}"),
        "createdAt": iso_utc(now),
        "components": manifests.iter().map(|(c, _)| json!({
            "id": c.id, "version": c.version,
            "manifestPath": manifest_path(c), "manifestSha256": c.manifest_sha256,
        })).collect::<Vec<_>>(),
        "files": listed,
    });
    let pack_json = serde_json::to_vec_pretty(&pack).map_err(|e| AppError::Io(e.to_string()))?;
    if pack_json.len() as u64 > MAX_PACK_JSON_BYTES {
        return bad("Too many files for one pack.");
    }
    let mut entries = vec![Entry {
        name: "pack.json".into(),
        source: Source::Bytes(&pack_json),
        compress: true,
    }];
    for (c, text) in &manifests {
        entries.push(Entry {
            name: manifest_path(c),
            source: Source::Bytes(text),
            compress: true,
        });
    }
    for (path, f) in &files {
        let sha256 = parse_sha(&f.sha256).ok_or_else(|| AppError::Io(path.clone()))?;
        entries.push(Entry {
            name: path.clone(),
            source: Source::File {
                path: f.source.clone(),
                sha256,
            },
            compress: !(path.ends_with(".png") || path.ends_with(".jpg")),
        });
    }
    write_atomic_with(target, |file| {
        write_zip(file, &entries, PACK_LIMITS.max_name_len)?;
        inspect_zip(&mut *file, &PACK_LIMITS, pack_entry_rule).map_err(|e| {
            AppError::Io(format!(
                "The pack did not check out ({e}); nothing was written."
            ))
        })?;
        Ok(())
    })?;
    Ok(ExportSummary {
        components: manifests.len(),
        files: files.len() + manifests.len(),
        bytes: files.values().map(|f| f.bytes).sum::<u64>()
            + manifests.iter().map(|(_, t)| t.len() as u64).sum::<u64>(),
    })
}
