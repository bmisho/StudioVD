//! Files the user chose: in an open/save dialog or by dropping them on the window (PLAN 4.1).
//! The webview never sends a path. It gets an opaque token per file and asks for that file's
//! bytes, or for a sibling a .gltf/.obj names, which must resolve inside the same directory.

use crate::error::{AppError, AppResult};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};

/// Largest file read for an import (a big STEP assembly is a few hundred MB).
pub const MAX_IMPORT_BYTES: u64 = 1024 * 1024 * 1024;

/// Extensions the import pipeline reads (`IMPORT_EXTENSIONS` in `src/core/import`).
pub const IMPORT_EXTENSIONS: [&str; 8] =
    ["glb", "gltf", "obj", "stl", "step", "stp", "iges", "igs"];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PickedFile {
    pub token: String,
    pub name: String,
    pub size: u64,
}

/// What a drop on the window registered: importable files get tokens, the rest are named.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct DroppedFiles {
    pub files: Vec<PickedFile>,
    pub skipped: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Access {
    Read,
    Write,
}

#[derive(Default)]
pub struct PickedFiles {
    next: u64,
    entries: HashMap<String, (PathBuf, Access)>,
}

pub fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default()
}

pub fn has_import_extension(path: &Path) -> bool {
    path.extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .is_some_and(|e| IMPORT_EXTENSIONS.contains(&e.as_str()))
}

impl PickedFiles {
    fn insert(&mut self, path: PathBuf, access: Access) -> String {
        self.next += 1;
        let token = format!("f{}", self.next);
        self.entries.insert(token.clone(), (path, access));
        token
    }

    /// Registers a file to read. Directories and unreadable paths are refused.
    pub fn add_source(&mut self, path: PathBuf) -> AppResult<PickedFile> {
        let meta = fs::metadata(&path)?;
        if !meta.is_file() {
            return Err(AppError::InvalidInput(format!(
                "{} is not a file.",
                file_name(&path)
            )));
        }
        let name = file_name(&path);
        let token = self.insert(path, Access::Read);
        Ok(PickedFile {
            token,
            name,
            size: meta.len(),
        })
    }

    /// Registers dropped paths: files with an import extension get read tokens; folders,
    /// other file types and unreadable paths are listed as skipped.
    pub fn add_dropped(&mut self, paths: &[PathBuf]) -> DroppedFiles {
        let mut dropped = DroppedFiles {
            files: Vec::new(),
            skipped: Vec::new(),
        };
        for path in paths {
            match has_import_extension(path).then(|| self.add_source(path.clone())) {
                Some(Ok(file)) => dropped.files.push(file),
                _ => dropped.skipped.push(file_name(path)),
            }
        }
        dropped
    }

    /// Registers the destination chosen in a save dialog.
    pub fn add_target(&mut self, path: PathBuf) -> PickedFile {
        let name = file_name(&path);
        PickedFile {
            token: self.insert(path, Access::Write),
            name,
            size: 0,
        }
    }

    fn path(&self, token: &str, access: Access) -> AppResult<PathBuf> {
        match self.entries.get(token) {
            Some((path, a)) if *a == access => Ok(path.clone()),
            _ => Err(AppError::InvalidInput(format!(
                "Unknown file token '{token}'."
            ))),
        }
    }

    pub fn source(&self, token: &str) -> AppResult<PathBuf> {
        self.path(token, Access::Read)
    }

    pub fn target(&self, token: &str) -> AppResult<PathBuf> {
        self.path(token, Access::Write)
    }
}

/// Resolves `relative` (a URI a .gltf or .obj file wrote, already percent-decoded) against the
/// directory of `base_file`. Only plain relative paths that stay inside that directory, after
/// following symlinks, are accepted.
pub fn resolve_sibling(base_file: &Path, relative: &str) -> AppResult<PathBuf> {
    let refuse =
        || AppError::InvalidInput(format!("'{relative}' is not a file next to the model."));
    let rel = Path::new(relative);
    if relative.is_empty()
        || relative.contains('\0')
        || !rel
            .components()
            .all(|c| matches!(c, Component::Normal(_) | Component::CurDir))
    {
        return Err(refuse());
    }
    let dir = base_file.parent().ok_or_else(refuse)?.canonicalize()?;
    let resolved = dir.join(rel).canonicalize().map_err(|_| refuse())?;
    if !resolved.starts_with(&dir) || !resolved.is_file() {
        return Err(refuse());
    }
    Ok(resolved)
}

/// Reads a whole file, refusing anything larger than `max` bytes (checked while reading too,
/// in case the file grows).
pub fn read_capped(path: &Path, max: u64) -> AppResult<Vec<u8>> {
    let file = fs::File::open(path)?;
    let len = file.metadata()?.len();
    if len > max {
        return Err(AppError::InvalidInput(format!(
            "{} is too large ({} MB, the limit is {} MB).",
            file_name(path),
            len / 1_000_000,
            max / 1_000_000
        )));
    }
    let mut bytes = Vec::with_capacity(usize::try_from(len).unwrap_or(0));
    file.take(max + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > max {
        return Err(AppError::InvalidInput(format!(
            "{} is too large.",
            file_name(path)
        )));
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests;
