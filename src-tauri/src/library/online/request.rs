//! HTTP requests for the catalog (PLAN 14.3): one send that waits out a busy server (429,
//! 503: `Retry-After`, else backoff) and small files read into memory with a cap.

use super::retry::{backoff, retry_after, MAX_RETRIES};
use crate::error::{AppError, AppResult};
use crate::net::diagnose::{explain, status};
use reqwest::header::RETRY_AFTER;
use reqwest::{Client, RequestBuilder, Response, StatusCode};
use tokio_util::sync::CancellationToken;

pub fn host_of(url: &str) -> String {
    reqwest::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(str::to_owned))
        .unwrap_or_else(|| "the server".into())
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn cancelled<T>() -> AppResult<T> {
    Err(AppError::Cancelled("The download was cancelled.".into()))
}

/// Sends a request, waiting and retrying while the server says it is busy (429, 503).
pub async fn send(
    make: impl Fn() -> RequestBuilder,
    url: &str,
    cancel: &CancellationToken,
) -> AppResult<Response> {
    let host = host_of(url);
    let mut attempt = 0;
    loop {
        let resp = tokio::select! {
            _ = cancel.cancelled() => return cancelled(),
            r = make().send() => r.map_err(|e| AppError::Network(explain(&host, &e)))?,
        };
        let code = resp.status();
        let busy = code == StatusCode::TOO_MANY_REQUESTS || code == StatusCode::SERVICE_UNAVAILABLE;
        if !busy || attempt >= MAX_RETRIES {
            return Ok(resp);
        }
        let wait = resp
            .headers()
            .get(RETRY_AFTER)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| retry_after(v, now_secs()))
            .unwrap_or_else(|| backoff(attempt));
        attempt += 1;
        tokio::select! {
            _ = cancel.cancelled() => return cancelled(),
            _ = tokio::time::sleep(wait) => {}
        }
    }
}

/// A small file (the index, a signature) into memory, refused past `max` bytes.
pub async fn get_small(
    client: &Client,
    url: &str,
    max: usize,
    cancel: &CancellationToken,
) -> AppResult<Vec<u8>> {
    let host = host_of(url);
    let mut resp = send(|| client.get(url), url, cancel).await?;
    if !resp.status().is_success() {
        return Err(AppError::Network(status(&host, resp.status())));
    }
    if resp.content_length().is_some_and(|n| n > max as u64) {
        return Err(AppError::InvalidInput(format!(
            "{host} sent a file larger than allowed."
        )));
    }
    let mut out = Vec::new();
    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| AppError::Network(explain(&host, &e)))?
    {
        if out.len() + chunk.len() > max {
            return Err(AppError::InvalidInput(format!(
                "{host} sent a file larger than allowed."
            )));
        }
        out.extend_from_slice(&chunk);
    }
    Ok(out)
}
