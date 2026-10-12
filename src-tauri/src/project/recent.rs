//! Recent projects (PLAN 5.3), in `<app config>/recent.json`. Paths stay in Rust: the
//! webview gets names and ids, and opens an entry by id.

use crate::fsutil::write_atomic;
use crate::picked::file_name;
use crate::workspace::sha256_hex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

const FILE: &str = "recent.json";
const MAX: usize = 10;

#[derive(Serialize, Deserialize, Default)]
#[serde(deny_unknown_fields)]
struct Store {
    version: u32,
    paths: Vec<PathBuf>,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RecentProject {
    pub id: String,
    pub name: String,
    /// The folder, for telling same-named files apart.
    pub folder: String,
    pub missing: bool,
}

fn load(config: &Path) -> Vec<PathBuf> {
    fs::read(config.join(FILE))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Store>(&bytes).ok())
        .filter(|store| store.version == 1)
        .map(|store| store.paths.into_iter().take(MAX).collect())
        .unwrap_or_default()
}

fn store(config: &Path, paths: Vec<PathBuf>) {
    let json = serde_json::to_vec(&Store { version: 1, paths });
    let written = fs::create_dir_all(config)
        .map_err(Into::into)
        .and_then(|()| write_atomic(&config.join(FILE), &json.unwrap_or_default()));
    if let Err(e) = written {
        eprintln!("StudioVD: recent projects not saved ({e}).");
    }
}

fn id_of(path: &Path) -> String {
    sha256_hex(path.to_string_lossy().as_bytes())[..16].to_owned()
}

/// Moves `path` to the top of the list.
pub fn add(config: &Path, path: &Path) {
    let mut paths = load(config);
    paths.retain(|p| p != path);
    paths.insert(0, path.to_path_buf());
    paths.truncate(MAX);
    store(config, paths);
}

pub fn list(config: &Path) -> Vec<RecentProject> {
    load(config)
        .iter()
        .map(|path| RecentProject {
            id: id_of(path),
            name: file_name(path),
            folder: path
                .parent()
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_default(),
            missing: !path.is_file(),
        })
        .collect()
}

pub fn resolve(config: &Path, id: &str) -> Option<PathBuf> {
    load(config).into_iter().find(|p| id_of(p) == id)
}

pub fn remove(config: &Path, id: &str) {
    let mut paths = load(config);
    paths.retain(|p| id_of(p) != id);
    store(config, paths);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_the_newest_ten_without_duplicates() {
        let dir = std::env::temp_dir().join(format!("studiovd-recent-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        for i in 0..12 {
            add(&dir, &dir.join(format!("p{i}.stvd")));
        }
        add(&dir, &dir.join("p5.stvd"));
        let names: Vec<String> = list(&dir).into_iter().map(|r| r.name).collect();
        assert_eq!(names.len(), 10);
        assert_eq!(names[0], "p5.stvd");
        assert_eq!(names[1], "p11.stvd");
        assert!(!names.contains(&"p1.stvd".to_owned()));
        let first = &list(&dir)[0];
        assert!(first.missing);
        assert_eq!(resolve(&dir, &first.id), Some(dir.join("p5.stvd")));
        remove(&dir, &first.id);
        assert_eq!(list(&dir).len(), 9);
        fs::write(dir.join(FILE), b"{\"version\":1,\"paths\":[],\"x\":1}").expect("write");
        assert!(
            list(&dir).is_empty(),
            "unknown fields: ignored, not trusted"
        );
        let _ = fs::remove_dir_all(dir);
    }
}
