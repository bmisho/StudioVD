//! Which entries of a downloaded zip are written, and under what name (PLAN 16.5).

use super::has_import_extension;
use crate::bundle::reserved;
use std::path::{Path, PathBuf};

/// Files a model may name next to it: OBJ material libraries, glTF buffers, textures.
const RESOURCES: [&str; 5] = ["mtl", "bin", "png", "jpg", "jpeg"];

/// A name that stays a plain relative path on Windows and Linux: no root, drive, `..`,
/// backslash, control or Windows-forbidden character, device name or trailing dot/space.
pub(super) fn safe_name(name: &str) -> Option<PathBuf> {
    if name.is_empty() || name.len() > 1024 || name.contains('\\') {
        return None;
    }
    let mut out = PathBuf::new();
    for c in name.split('/') {
        let bad_char = |ch: char| ch.is_control() || "<>:\"|?*".contains(ch);
        if c.is_empty()
            || c == "."
            || c == ".."
            || c.len() > 255
            || c.ends_with('.')
            || c.ends_with(' ')
            || c.chars().any(bad_char)
            || reserved(c)
        {
            return None;
        }
        out.push(c);
    }
    Some(out)
}

/// Resource forks and other noise macOS and Windows add to zips: left out silently.
pub(super) fn is_noise(name: &str) -> bool {
    name.starts_with("__MACOSX/")
        || name
            .rsplit('/')
            .next()
            .is_some_and(|f| f.starts_with("._") || f == "Thumbs.db")
}

pub(super) fn wanted(path: &Path) -> bool {
    has_import_extension(path)
        || path
            .extension()
            .map(|e| e.to_string_lossy().to_ascii_lowercase())
            .is_some_and(|e| RESOURCES.contains(&e.as_str()))
}
