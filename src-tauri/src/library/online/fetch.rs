//! Pack downloads (PLAN 14.3): into `<sha>.part` files, hashed while they stream, resumed with `Range` + `If-Range` after a dropped connection,
//! cancellable, with throttled progress and `Retry-After` on 429/503.

use super::request::{cancelled, send};
use crate::error::{AppError, AppResult};
use crate::net::diagnose::{explain, status};
use crate::workspace::hex;
use reqwest::header::{CONTENT_RANGE, ETAG, IF_RANGE, LAST_MODIFIED, RANGE};
use reqwest::{Client, Response, StatusCode};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_util::sync::CancellationToken;

/// What a download must be: its exact size and SHA-256 (both from the verified index).
/// How often progress is reported at most.
const PROGRESS_EVERY: Duration = Duration::from_millis(100);

pub struct Expect<'a> {
    pub bytes: u64,
    pub sha256: &'a str,
}

/// Where a resumable download keeps its validator (ETag or Last-Modified) and URL.
fn sidecar(part: &Path) -> PathBuf {
    part.with_extension("part.json")
}

#[derive(serde::Serialize, serde::Deserialize)]
struct Side {
    url: String,
    validator: String,
}

async fn discard(part: &Path) {
    let _ = tokio::fs::remove_file(part).await;
    let _ = tokio::fs::remove_file(sidecar(part)).await;
}

/// The bytes already in `part` for `url`, with their hash state, if they can be resumed.
async fn resumable(part: &Path, url: &str, max: u64) -> Option<(u64, Sha256, String)> {
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

/// A pack into `part` (renamed by the caller once this returns Ok): resumed when the server
/// still has the same file, refused past `want.bytes`, checked against `want.sha256`.
/// `progress(done, total)` is called at most every 100 ms and once at the end.
pub async fn download(
    client: &Client,
    url: &str,
    part: &Path,
    want: &Expect<'_>,
    cancel: &CancellationToken,
    progress: &mut (dyn FnMut(u64, u64) + Send),
) -> AppResult<()> {
    let host = super::request::host_of(url);
    let mut resume = resumable(part, url, want.bytes).await;
    for _ in 0..2 {
        let from = resume.as_ref().map(|r| r.0);
        let make = || {
            let req = client.get(url);
            match &resume {
                Some((offset, _, validator)) => req
                    .header(RANGE, format!("bytes={offset}-"))
                    .header(IF_RANGE, validator.as_str()),
                None => req,
            }
        };
        let resp = send(make, url, cancel).await?;
        let code = resp.status();
        if code == StatusCode::RANGE_NOT_SATISFIABLE && from.is_some() {
            discard(part).await; // the server's file changed under us: start over
            resume = None;
            continue;
        }
        let range_ok = code == StatusCode::PARTIAL_CONTENT
            && from.is_some_and(|f| {
                resp.headers()
                    .get(CONTENT_RANGE)
                    .and_then(|v| v.to_str().ok())
                    .is_some_and(|v| v.starts_with(&format!("bytes {f}-")))
            });
        if !code.is_success() || (code == StatusCode::PARTIAL_CONTENT && !range_ok) {
            return Err(AppError::Network(status(&host, code)));
        }
        let (offset, hasher) = match resume.take() {
            Some((offset, hasher, _)) if range_ok => (offset, hasher),
            _ => (0, Sha256::new()), // 200: the whole file again
        };
        let validator = [ETAG, LAST_MODIFIED]
            .iter()
            .filter_map(|h| resp.headers().get(h)?.to_str().ok())
            .find(|v| !v.starts_with("W/"))
            .map(str::to_owned);
        if let Some(validator) = validator {
            let side = serde_json::to_vec(&Side {
                url: url.to_owned(),
                validator,
            })
            .map_err(|e| AppError::Io(e.to_string()))?;
            tokio::fs::write(sidecar(part), side).await?;
        }
        return stream(resp, part, offset, hasher, want, cancel, progress, &host).await;
    }
    Err(AppError::Network(format!(
        "{host} keeps changing the file; try again later."
    )))
}

#[allow(clippy::too_many_arguments)]
async fn stream(
    mut resp: Response,
    part: &Path,
    offset: u64,
    mut hasher: Sha256,
    want: &Expect<'_>,
    cancel: &CancellationToken,
    progress: &mut (dyn FnMut(u64, u64) + Send),
    host: &str,
) -> AppResult<()> {
    if resp
        .content_length()
        .is_some_and(|n| offset + n > want.bytes)
    {
        discard(part).await;
        return Err(AppError::InvalidInput(format!(
            "{host} sent a larger file than the catalog lists."
        )));
    }
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .append(offset > 0)
        .truncate(offset == 0)
        .open(part)
        .await?;
    let mut done = offset;
    let mut last = Instant::now();
    progress(done, want.bytes);
    loop {
        let chunk = tokio::select! {
            _ = cancel.cancelled() => {
                drop(file);
                discard(part).await;
                return cancelled();
            }
            c = resp.chunk() => c,
        };
        let Some(chunk) = chunk.map_err(|e| AppError::Network(explain(host, &e)))? else {
            break;
        };
        done += chunk.len() as u64;
        if done > want.bytes {
            drop(file);
            discard(part).await;
            return Err(AppError::InvalidInput(format!(
                "{host} sent a larger file than the catalog lists."
            )));
        }
        file.write_all(&chunk).await?;
        hasher.update(&chunk);
        if last.elapsed() >= PROGRESS_EVERY {
            progress(done, want.bytes);
            last = Instant::now();
        }
    }
    file.flush().await?;
    drop(file);
    if done != want.bytes {
        return Err(AppError::Network(format!(
            "The connection to {host} dropped before the end; try again to resume."
        )));
    }
    progress(done, want.bytes);
    if hex(&hasher.finalize()) != want.sha256 {
        discard(part).await;
        return Err(AppError::InvalidInput(format!(
            "The file from {host} does not match the catalog (SHA-256); it was deleted."
        )));
    }
    let _ = tokio::fs::remove_file(sidecar(part)).await;
    Ok(())
}
