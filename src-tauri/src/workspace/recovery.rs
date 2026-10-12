//! Crash recovery (PLAN 5.5): a workspace that holds an autosave and that no running
//! instance holds belongs to a session that ended without saving or discarding its changes.

use super::{Workspace, AUTOSAVE_FILE};
use crate::error::AppResult;
use crate::fsutil::write_atomic;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

const MANIFEST_FILE: &str = "manifest.json";
/// Autosaves are scene.json text, which the webview caps at 64 MiB.
pub const MAX_AUTOSAVE_BYTES: u64 = 64 * 1024 * 1024;

/// Which `.stvd` a workspace belongs to. Written by Rust only; the path never reaches the
/// webview (CLAUDE.md §9), only its file name.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Manifest {
    format: String,
    version: u32,
    project_path: Option<PathBuf>,
}

pub fn write_manifest(ws: &Workspace, project: Option<&Path>) -> AppResult<()> {
    let manifest = Manifest {
        format: "studiovd-workspace".into(),
        version: 1,
        project_path: project.map(Path::to_path_buf),
    };
    let json =
        serde_json::to_vec(&manifest).map_err(|e| crate::error::AppError::Io(e.to_string()))?;
    write_atomic(&ws.root().join(MANIFEST_FILE), &json)
}

/// The project file a workspace belongs to, if it was ever opened from or saved to one.
pub fn project_path(root: &Path) -> Option<PathBuf> {
    let bytes = fs::read(root.join(MANIFEST_FILE)).ok()?;
    let manifest: Manifest = serde_json::from_slice(&bytes).ok()?;
    (manifest.format == "studiovd-workspace" && manifest.version == 1)
        .then_some(manifest.project_path)
        .flatten()
}

/// What the recovery prompt shows about one workspace.
pub struct Candidate {
    pub root: PathBuf,
    pub title: String,
    pub file_name: Option<String>,
    pub autosaved_at_ms: u64,
    pub size_bytes: u64,
}

/// Recoverable workspaces under `base`, newest first. Each is probed with its lock (and
/// released again): one that a running instance holds is not a crash leftover.
pub fn candidates(base: &Path, current: &Path) -> Vec<Candidate> {
    let Ok(entries) = fs::read_dir(base) else {
        return Vec::new();
    };
    let mut found: Vec<Candidate> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|root| root != current && root.join(AUTOSAVE_FILE).is_file())
        .filter(|root| {
            root.file_name()
                .is_some_and(|n| n.to_string_lossy().starts_with("ws-"))
        })
        .filter(|root| Workspace::adopt(root).is_ok()) // dropped at once: lock released
        .filter_map(|root| candidate(&root))
        .collect();
    found.sort_by_key(|c| std::cmp::Reverse(c.autosaved_at_ms));
    found
}

fn candidate(root: &Path) -> Option<Candidate> {
    let autosave = root.join(AUTOSAVE_FILE);
    let meta = fs::metadata(&autosave).ok()?;
    let autosaved_at_ms = meta
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis()
        .try_into()
        .ok()?;
    let title = (meta.len() <= MAX_AUTOSAVE_BYTES)
        .then(|| project_name(&autosave))
        .flatten()
        .unwrap_or_else(|| "Untitled".into());
    let file_name = project_path(root).map(|p| crate::picked::file_name(&p));
    Some(Candidate {
        root: root.to_path_buf(),
        title,
        file_name,
        autosaved_at_ms,
        size_bytes: meta.len(),
    })
}

/// `project.name` from an autosave, printable and at most 120 characters. The webview
/// validates the whole file only when the user restores it.
fn project_name(autosave: &Path) -> Option<String> {
    #[derive(Deserialize)]
    struct Head {
        project: Project,
    }
    #[derive(Deserialize)]
    struct Project {
        name: String,
    }
    let head: Head = serde_json::from_slice(&fs::read(autosave).ok()?).ok()?;
    let name: String = head
        .project
        .name
        .chars()
        .filter(|c| !c.is_control())
        .take(120)
        .collect();
    (!name.trim().is_empty()).then(|| name.trim().to_owned())
}
