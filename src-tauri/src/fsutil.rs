//! Crash-safe file replacement shared by asset writes, exports, saves and app config.

use crate::error::{AppError, AppResult};
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

/// A fresh temporary name next to `dest`: unique per process and write, never existing.
fn temp_path(dest: &Path) -> AppResult<PathBuf> {
    let dir = dest
        .parent()
        .ok_or_else(|| AppError::InvalidInput("The path has no directory.".into()))?;
    let name = dest
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let n = NEXT.fetch_add(1, Ordering::Relaxed);
    Ok(dir.join(format!(".{name}.{}.{n}.tmp", std::process::id())))
}

/// Writes `dest` through a temporary file in the same directory, synced, then renamed into
/// place: a crash or a failed write never leaves a half-written file under the final name,
/// and the old file stays intact until the rename (Windows and Linux).
pub fn write_atomic_with(
    dest: &Path,
    write: impl FnOnce(&mut File) -> AppResult<()>,
) -> AppResult<()> {
    let temp = temp_path(dest)?;
    let result = (|| {
        // Readable too: a writer may check what it wrote (the .stvd self-check).
        let mut file = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create_new(true)
            .open(&temp)?;
        write(&mut file)?;
        file.sync_all()?;
        drop(file);
        replace(&temp, dest)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

pub fn write_atomic(dest: &Path, bytes: &[u8]) -> AppResult<()> {
    write_atomic_with(dest, |file| Ok(file.write_all(bytes)?))
}

/// Renames `temp` over `dest`. On Windows a sync client, antivirus or preview pane may hold
/// the target briefly (sharing or lock violation, access denied): retried with backoff.
fn replace(temp: &Path, dest: &Path) -> io::Result<()> {
    let mut delay_ms = 50;
    loop {
        match fs::rename(temp, dest) {
            Ok(()) => break,
            Err(e) if cfg!(windows) && delay_ms <= 800 && is_transient(&e) => {
                std::thread::sleep(std::time::Duration::from_millis(delay_ms));
                delay_ms *= 2;
            }
            Err(e) => return Err(e),
        }
    }
    // The rename itself must survive a power cut: sync the directory entry (unix only;
    // Windows has no directory handles to sync).
    #[cfg(unix)]
    if let Some(dir) = dest.parent() {
        File::open(dir)?.sync_all()?;
    }
    Ok(())
}

/// ERROR_ACCESS_DENIED (5), ERROR_SHARING_VIOLATION (32), ERROR_LOCK_VIOLATION (33).
fn is_transient(e: &io::Error) -> bool {
    matches!(e.raw_os_error(), Some(5 | 32 | 33))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_replace_atomically_and_clean_up_after_failures() {
        let dir = std::env::temp_dir().join(format!("studiovd-fsutil-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("dir");
        let dest = dir.join("a.bin");
        write_atomic(&dest, b"one").expect("first write");
        write_atomic(&dest, b"two").expect("replace");
        assert_eq!(fs::read(&dest).expect("read"), b"two");
        let failed = write_atomic_with(&dest, |file| {
            file.write_all(b"partial")?;
            Err(AppError::Io("boom".into()))
        });
        assert!(failed.is_err());
        assert_eq!(fs::read(&dest).expect("read"), b"two", "old file intact");
        let names: Vec<_> = fs::read_dir(&dir).expect("list").flatten().collect();
        assert_eq!(names.len(), 1, "no temp file left behind");
        let _ = fs::remove_dir_all(dir);
    }
}
