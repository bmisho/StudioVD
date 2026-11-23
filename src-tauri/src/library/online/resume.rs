//! Resumable downloads (PLAN 14.3): a `.part` file keeps a sidecar with the URL and the server's
//! validator (a strong ETag or Last-Modified), so the next attempt can ask for the rest with
//! `Range` + `If-Range` and carry on hashing from where the bytes on disk end.

use crate::error::{AppError, AppResult};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tokio::io::AsyncReadExt;

fn sidecar(part: &Path) -> PathBuf {
    part.with_extension("part.json")
}

#[derive(serde::Serialize, serde::Deserialize)]
struct Side {
    url: String,
    validator: String,
}

/// Deletes a part and its sidecar (cancelled, refused or not matching the catalog).
pub async fn discard(part: &Path) {
    let _ = tokio::fs::remove_file(part).await;
    let _ = tokio::fs::remove_file(sidecar(part)).await;
}

/// Records what the bytes in `part` are, so a later attempt can resume them.
pub async fn remember(part: &Path, url: &str, validator: String) -> AppResult<()> {
    let side = serde_json::to_vec(&Side {
        url: url.to_owned(),
        validator,
    })
    .map_err(|e| AppError::Io(e.to_string()))?;
    tokio::fs::write(sidecar(part), side).await?;
    Ok(())
}

/// The download is complete: nothing is left to resume.
pub async fn forget(part: &Path) {
    let _ = tokio::fs::remove_file(sidecar(part)).await;
}

/// The bytes already in `part` for `url`, with their hash state, if they can be resumed.
pub async fn resumable(part: &Path, url: &str, max: u64) -> Option<(u64, Sha256, String)> {
    let side: Side = serde_json::from_slice(&tokio::fs::read(sidecar(part)).await.ok()?).ok()?;
    let len = tokio::fs::metadata(part).await.ok()?.len();
    if side.url != url || len == 0 || len >= max {
        return None;
    }
    let mut file = tokio::fs::File::open(part).await.ok()?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = file.read(&mut buf).await.ok()?;
        if n == 0 {
            return Some((len, hasher, side.validator));
        }
        hasher.update(&buf[..n]);
    }
}
