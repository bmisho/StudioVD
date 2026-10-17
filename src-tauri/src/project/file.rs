//! Telling whether a project file is the one open, or changed since it was read.

use std::fs;
use std::path::Path;
use std::time::SystemTime;

/// Enough to tell a file was replaced or written since it was read. Times alone can miss a
/// quick rewrite (Linux file times advance once per kernel tick), but a save writes a new
/// file and renames it over the old one, which gives it a new inode.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FileStamp {
    len: u64,
    modified: Option<SystemTime>,
    created: Option<SystemTime>,
    inode: Option<u64>,
}

pub fn file_stamp(path: &Path) -> Option<FileStamp> {
    let meta = fs::metadata(path).ok()?;
    #[cfg(unix)]
    let inode = Some(std::os::unix::fs::MetadataExt::ino(&meta));
    #[cfg(not(unix))]
    let inode = None;
    Some(FileStamp {
        len: meta.len(),
        modified: meta.modified().ok(),
        created: meta.created().ok(),
        inode,
    })
}

/// The file at `path` is no longer the one stamped (or is gone).
pub fn changed_since(path: &Path, stamp: FileStamp) -> bool {
    file_stamp(path) != Some(stamp)
}

/// Whether two paths name the same file (through symlinks and `..` when both exist).
pub fn same_path(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fsutil::write_atomic;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("studiovd-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("sub")).expect("temp dir");
        dir
    }

    #[test]
    fn a_save_over_the_file_changes_its_stamp() {
        let dir = temp_dir("stamp");
        let path = dir.join("robot.stvd");
        fs::write(&path, b"before").expect("write");
        let stamp = file_stamp(&path).expect("stamp");
        assert!(!changed_since(&path, stamp));
        write_atomic(&path, b"saved over").expect("save");
        assert!(changed_since(&path, stamp));
        fs::remove_file(&path).expect("remove");
        assert!(changed_since(&path, stamp), "a deleted file changed too");
        let _ = fs::remove_dir_all(dir);
    }

    #[cfg(unix)]
    #[test]
    fn a_same_size_save_in_the_same_instant_is_still_seen() {
        let dir = temp_dir("inode");
        let path = dir.join("robot.stvd");
        fs::write(&path, b"before").expect("write");
        let stamp = file_stamp(&path).expect("stamp");
        write_atomic(&path, b"after!").expect("save"); // same size, within one tick
        assert!(changed_since(&path, stamp));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn the_same_file_by_another_spelling_is_the_same() {
        let dir = temp_dir("same");
        let path = dir.join("robot.stvd");
        fs::write(&path, b"x").expect("write");
        assert!(same_path(
            &path,
            &dir.join("sub").join("..").join("robot.stvd")
        ));
        assert!(!same_path(&path, &dir.join("other.stvd")));
        let _ = fs::remove_dir_all(dir);
    }
}
