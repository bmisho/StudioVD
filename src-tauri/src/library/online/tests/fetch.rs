//! The downloader against a mock server (PLAN 14.9): 200, 206 resume after a dropped
//! connection, 416, 429 with Retry-After, redirects, a truncated or oversized body, a wrong
//! hash, cancellation mid-stream.

use super::mock::{serve, Reply};
use super::{client, temp_dir};
use crate::library::online::fetch::{download, Expect};
use crate::library::online::request::get_small;
use crate::workspace::sha256_hex;
use std::path::Path;
use tokio_util::sync::CancellationToken;

fn body() -> Vec<u8> {
    (0..50_000u32).map(|i| (i * 7 % 251) as u8).collect()
}

async fn get(url: &str, part: &Path, data: &[u8]) -> Result<(), crate::error::AppError> {
    let want = Expect {
        bytes: data.len() as u64,
        sha256: &sha256_hex(data),
    };
    let mut seen = Vec::new();
    let result = download(
        &client(),
        url,
        part,
        &want,
        &CancellationToken::new(),
        &mut |d, _| seen.push(d),
    )
    .await;
    assert!(seen.windows(2).all(|w| w[0] <= w[1]), "progress only grows");
    result
}

#[tokio::test]
async fn downloads_whole_files_and_follows_redirects() {
    let data = body();
    let served = data.clone();
    let mock = serve(move |req, _| match req.path.as_str() {
        "/moved" => Reply::status(302).header("Location", "/pack"),
        "/loop" => Reply::status(302).header("Location", "/loop"),
        _ => Reply::ok(&served),
    });
    let dir = temp_dir("fetch-ok");
    let part = dir.join("a.part");
    get(&format!("{}moved", mock.base), &part, &data)
        .await
        .expect("downloaded");
    assert_eq!(std::fs::read(&part).expect("file"), data);
    let looped = get(&format!("{}loop", mock.base), &dir.join("b.part"), &data).await;
    assert_eq!(looped.unwrap_err().kind(), "network");
}

#[tokio::test]
async fn resumes_with_range_and_if_range_after_a_dropped_connection() {
    let data = body();
    let served = data.clone();
    let mock = serve(move |req, nth| {
        let tagged = |r: Reply| r.header("ETag", "\"v1\"");
        match (nth, req.headers.get("range")) {
            (0, None) => tagged(Reply {
                cut_after: Some(20_000),
                ..Reply::ok(&served)
            }),
            (_, Some(range)) if range == "bytes=20000-" => {
                let rest = &served[20_000..];
                tagged(Reply::ok(rest)).header(
                    "Content-Range",
                    &format!("bytes 20000-{}/{}", served.len() - 1, served.len()),
                )
            }
            _ => Reply::status(500),
        }
        .with_status_for_range()
    });
    let dir = temp_dir("fetch-resume");
    let part = dir.join("p.part");
    let url = format!("{}pack", mock.base);
    let first = get(&url, &part, &data).await;
    assert_eq!(first.unwrap_err().kind(), "network");
    assert_eq!(std::fs::metadata(&part).expect("kept").len(), 20_000);
    get(&url, &part, &data).await.expect("resumed");
    assert_eq!(std::fs::read(&part).expect("file"), data);
    let hits = mock.hits();
    assert_eq!(
        hits[1].headers.get("if-range").map(String::as_str),
        Some("\"v1\"")
    );
}

#[tokio::test]
async fn starts_over_on_416_and_waits_out_429() {
    let data = body();
    let served = data.clone();
    let mock = serve(move |req, nth| match (req.path.as_str(), nth) {
        ("/busy", 0) => Reply::status(429).header("Retry-After", "0"),
        ("/busy", _) => Reply::ok(&served),
        (_, 0) => Reply {
            cut_after: Some(1_000),
            ..Reply::ok(&served).header("ETag", "\"v1\"")
        },
        (_, 1) => Reply::status(416),
        _ => Reply::ok(&served),
    });
    let dir = temp_dir("fetch-416");
    let part = dir.join("p.part");
    let url = format!("{}changed", mock.base);
    assert!(get(&url, &part, &data).await.is_err());
    get(&url, &part, &data).await.expect("started over");
    assert_eq!(std::fs::read(&part).expect("file"), data);
    get(&format!("{}busy", mock.base), &dir.join("b.part"), &data)
        .await
        .expect("after waiting");
}

#[tokio::test]
async fn refuses_wrong_hashes_oversized_and_short_bodies() {
    let data = body();
    let served = data.clone();
    let mock = serve(move |req, _| match req.path.as_str() {
        "/short" => Reply {
            length: Some(served.len()),
            cut_after: Some(10),
            ..Reply::ok(&served)
        },
        "/big" => Reply::ok(&[served.as_slice(), b"extra"].concat()),
        _ => Reply::ok(&served),
    });
    let dir = temp_dir("fetch-bad");
    let part = dir.join("p.part");
    let wrong = Expect {
        bytes: data.len() as u64,
        sha256: &"0".repeat(64),
    };
    let none = CancellationToken::new();
    let got = download(
        &client(),
        &format!("{}pack", mock.base),
        &part,
        &wrong,
        &none,
        &mut |_, _| {},
    )
    .await;
    assert_eq!(got.unwrap_err().kind(), "invalidInput");
    assert!(!part.exists(), "a file that does not match is deleted");
    let big = get(&format!("{}big", mock.base), &part, &data).await;
    assert_eq!(big.unwrap_err().kind(), "invalidInput");
    let short = get(&format!("{}short", mock.base), &part, &data).await;
    assert_eq!(short.unwrap_err().kind(), "network");
    let small = get_small(&client(), &format!("{}pack", mock.base), 100, &none).await;
    assert_eq!(small.unwrap_err().kind(), "invalidInput");
}

#[tokio::test]
async fn cancels_mid_stream_and_deletes_the_part() {
    let data = body();
    let served = data.clone();
    let mock = serve(move |_, _| Reply {
        stall_after: Some(5_000),
        ..Reply::ok(&served)
    });
    let dir = temp_dir("fetch-cancel");
    let part = dir.join("p.part");
    let cancel = CancellationToken::new();
    let later = cancel.clone();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        later.cancel();
    });
    let want = Expect {
        bytes: data.len() as u64,
        sha256: &sha256_hex(&data),
    };
    let got = download(
        &client(),
        &format!("{}pack", mock.base),
        &part,
        &want,
        &cancel,
        &mut |_, _| {},
    )
    .await;
    assert_eq!(got.unwrap_err().kind(), "cancelled");
    assert!(!part.exists());
}

trait RangeStatus {
    fn with_status_for_range(self) -> Self;
}

impl RangeStatus for Reply {
    /// A reply carrying Content-Range is a 206.
    fn with_status_for_range(mut self) -> Self {
        if self.headers.iter().any(|(k, _)| k == "Content-Range") {
            self.status = 206;
        }
        self
    }
}
