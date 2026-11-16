//! Save as component and Add to my library (PLAN 9.7): a manifest the webview built from the
//! open project (and validated with the same schema as a downloaded one), with the geometry,
//! textures and licence texts it names taken from the project's workspace. Each file is
//! checked as a pack's would be (content address, kind, GLB rules, size), then the component
//! is recorded: as the user's own in their namespace, else as unverified.

use super::install::{PACK_LIMITS, RESERVED};
use super::installed::{self, InstalledComponent, Origin};
use super::packfile::{check_component_id, check_version, file_kind, FileKind};
use super::publisher;
use super::verify::check_content;
use super::Library;
use crate::bundle::guard::check_name;
use crate::error::{AppError, AppResult};
use crate::fsutil::write_atomic;
use crate::workspace::sha256_hex;
use serde_json::Value;
use std::collections::{BTreeSet, HashMap};
use std::fs;
use std::path::Path;

/// Largest component.json (the pack cap).
const MAX_MANIFEST_BYTES: usize = 4 * 1024 * 1024;
/// Most files one size query may ask about (a manifest holds at most 64 parts).
const MAX_SIZE_QUERY: usize = 256;

fn bad<T>(reason: impl Into<String>) -> AppResult<T> {
    Err(AppError::InvalidInput(reason.into()))
}

/// The byte sizes of project geometry files (`geometry/<sha256>.glb`), which a manifest records.
pub fn geometry_sizes(bundle: &Path, names: &[String]) -> AppResult<Vec<u64>> {
    if names.len() > MAX_SIZE_QUERY {
        return bad("Too many files.");
    }
    names
        .iter()
        .map(|name| match file_kind(name) {
            Some((FileKind::Geometry, _)) => fs::metadata(bundle.join(name))
                .map(|m| m.len())
                .or_else(|_| bad(format!("The project no longer holds {name}."))),
            _ => bad(format!("{name:?} is not a geometry file.")),
        })
        .collect()
}

/// Every string in the manifest that names a content-addressed project file.
fn named_files(manifest: &Value) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    let mut stack = vec![manifest];
    while let Some(v) = stack.pop() {
        match v {
            Value::String(s) => {
                if let Some((FileKind::Geometry | FileKind::Texture | FileKind::License, _)) =
                    file_kind(s)
                {
                    out.insert(s.clone());
                }
            }
            Value::Array(items) => stack.extend(items),
            Value::Object(map) => stack.extend(map.values()),
            _ => {}
        }
    }
    out
}

/// Each `{"kind":"asset","path":…,"bytes":…}` states its GLB's real size.
fn check_asset_sizes(manifest: &Value, sizes: &HashMap<String, u64>) -> AppResult<()> {
    let mut stack = vec![manifest];
    while let Some(v) = stack.pop() {
        match v {
            Value::Object(map) => {
                if map.get("kind").and_then(Value::as_str) == Some("asset") {
                    let path = map.get("path").and_then(Value::as_str).unwrap_or_default();
                    let bytes = map.get("bytes").and_then(Value::as_u64);
                    if bytes.is_none() || sizes.get(path).copied() != bytes {
                        return bad(format!("The size recorded for {path} is wrong."));
                    }
                }
                stack.extend(map.values());
            }
            Value::Array(items) => stack.extend(items),
            _ => {}
        }
    }
    Ok(())
}

fn identity(manifest: &Value) -> AppResult<(String, String)> {
    let field = |key: &str| {
        manifest
            .pointer(&format!("/identity/{key}"))
            .and_then(Value::as_str)
            .map(str::to_owned)
    };
    match (field("id"), field("version")) {
        (Some(id), Some(version)) if check_component_id(&id) && check_version(&version) => {
            Ok((id, version))
        }
        _ => bad("The component has no valid id and version."),
    }
}

/// Records the component (`text` is its component.json) with the project files it names.
/// The same id and version with the same text is already there (nothing to do); with other
/// text it is refused, so a saved version never changes under a project that used it.
/// Returns everything installed now.
pub fn add_from_project(
    lib: &Library,
    bundle: &Path,
    text: &str,
    now: u64,
) -> AppResult<Vec<InstalledComponent>> {
    if text.len() > MAX_MANIFEST_BYTES {
        return bad("The component is too large.");
    }
    let manifest: Value =
        serde_json::from_str(text).or_else(|_| bad("The component is not JSON."))?;
    let (id, version) = identity(&manifest)?;
    // Its folder here and its path in a pack: the names an archive may hold (no device names).
    let pack_path = format!("components/{id}/{version}/component.json");
    check_name(pack_path.as_bytes(), PACK_LIMITS.max_name_len)
        .map_err(|_| AppError::InvalidInput(format!("{id} cannot be a folder name.")))?;
    let ns = id.split('/').next().unwrap_or_default();
    if RESERVED.contains(&ns) {
        return bad(format!(
            "{id} is in a namespace only signed catalogs may install."
        ));
    }
    if manifest
        .get("thumbnails")
        .and_then(Value::as_array)
        .is_some_and(|t| !t.is_empty())
    {
        return bad("Projects do not keep thumbnails; save the component without them.");
    }
    let files = named_files(&manifest);
    let mut sizes = HashMap::new();
    for name in &files {
        let path = bundle.join(name);
        let bytes =
            fs::read(&path).or_else(|_| bad(format!("The project no longer holds {name}.")))?;
        let (_, cap) = file_kind(name).ok_or_else(|| AppError::InvalidInput(name.clone()))?;
        if bytes.len() as u64 > cap || !name.contains(&sha256_hex(&bytes)) {
            return bad(format!("{name} in the project is damaged or too large."));
        }
        check_content(&path, name)?;
        sizes.insert(name.clone(), bytes.len() as u64);
    }
    check_asset_sizes(&manifest, &sizes)?;
    let origin = if ns == publisher::namespace(lib)? {
        Origin::User
    } else {
        Origin::Sideloaded
    };
    let manifest_sha256 = sha256_hex(text.as_bytes());

    let lock = lib.lock()?;
    let mut all = installed::load(lib);
    if let Some(existing) = all.iter().find(|c| c.id == id && c.version == version) {
        if existing.manifest_sha256 == manifest_sha256 {
            return Ok(all);
        }
        return bad(format!(
            "{id} {version} is already in your library with other content; save it as a new version."
        ));
    }
    for name in &files {
        let dest = lib.store_dir().join(name);
        if !dest.is_file() {
            write_atomic(&dest, &fs::read(bundle.join(name))?)?;
        }
    }
    let dir = lib.component_dir(&id, &version);
    fs::create_dir_all(&dir)?;
    write_atomic(&dir.join("component.json"), text.as_bytes())?;
    let record = InstalledComponent {
        id,
        version,
        manifest_sha256,
        origin,
        pack_sha256: None,
        installed_at: now,
        blobs: files.into_iter().collect(),
    };
    // The record goes last: a folder without one is not installed (rebuild skips it).
    installed::write_record(lib, &record)?;
    all.push(record);
    installed::save(lib, &mut all)?;
    drop(lock);
    Ok(all)
}
