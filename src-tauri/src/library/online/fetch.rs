//! Pack downloads (PLAN 14.3): into `<sha>.part` files, hashed while they stream, resumed with
//! `Range` + `If-Range` after a dropped connection (`resume.rs`), cancellable, with throttled
//! progress and `Retry-After` on 429/503.

use super::request::{cancelled, send};
use super::resume::{discard, forget, remember, resumable};
use crate::error::{AppError, AppResult};
use crate::net::diagnose::{explain, status};
use crate::workspace::hex;
use reqwest::header::{CONTENT_RANGE, ETAG, IF_RANGE, LAST_MODIFIED, RANGE};
use reqwest::{Client, Response, StatusCode};
use sha2::{Digest, Sha256};
use std::path::Path;
use std::time::{Duration, Instant};
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;

/// How often progress is reported at most.
const PROGRESS_EVERY: Duration = Duration::from_millis(100);

/// What a download must be: its exact size and SHA-256 (both from the verified index).
pub struct Expect<'a> {
    pub bytes: u64,
    pub sha256: &'a str,
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
            remember(part, url, validator).await?;
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
                let _ = file.flush().await;
                drop(file);
                discard(part).await;
                return cancelled();
            }
            c = resp.chunk() => c,
        };
        let chunk = match chunk {
            Ok(Some(chunk)) => chunk,
            Ok(None) => break,
            Err(e) => {
                // tokio writes on a background thread: what arrived is on disk before the next
                // attempt measures it for its Range offset.
                file.flush().await?;
                return Err(AppError::Network(explain(host, &e)));
            }
        };
        done += chunk.len() as u64;
        if done > want.bytes {
            let _ = file.flush().await;
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
    forget(part).await;
    Ok(())
}
