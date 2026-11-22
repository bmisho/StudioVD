//! Refresh and download (PLAN 14.3): the index from each host in turn until one verifies,
//! then its thumbnails; a pack from each host in turn until one matches the index.

use super::cache;
use super::fetch::{download, Expect};
use super::meta::IndexMeta;
use super::previews;
use super::request::get_small;
use super::signed::{MAX_INDEX_BYTES, MAX_SIGNATURE_BYTES};
use super::source::CatalogSource;
use super::space;
use crate::error::{AppError, AppResult};
use crate::library::Library;
use reqwest::Client;
use std::path::PathBuf;
use tokio_util::sync::CancellationToken;

/// Where a host's mistake is worth reporting over another's: a refused index (rollback,
/// bad signature) says more than "no connection" to a second host.
fn rank(e: &AppError) -> u8 {
    match e {
        AppError::InvalidInput(_) => 2,
        AppError::Network(_) => 1,
        _ => 0,
    }
}

pub struct Refreshed {
    pub changed: bool,
    /// Preview packs that could not be fetched (the catalog still works without them).
    pub previews_failed: usize,
}

pub struct Ctx<'a> {
    pub lib: &'a Library,
    pub source: &'a CatalogSource,
    pub client: &'a Client,
    pub mirror: Option<&'a str>,
    pub cancel: &'a CancellationToken,
    pub now: u64,
    pub app_version: &'a str,
}

pub async fn refresh(ctx: &Ctx<'_>) -> AppResult<Refreshed> {
    if !ctx.source.configured() {
        return Err(AppError::InvalidInput(
            "This build has no online catalog configured.".into(),
        ));
    }
    let mut best: Option<AppError> = None;
    for url in ctx.source.index_urls(ctx.mirror) {
        let fetched = async {
            let index = get_small(ctx.client, &url, MAX_INDEX_BYTES, ctx.cancel).await?;
            let sig_url = format!("{url}.minisig");
            let sig = get_small(ctx.client, &sig_url, MAX_SIGNATURE_BYTES, ctx.cancel).await?;
            cache::accept(ctx.lib, ctx.source, &index, &sig, ctx.now, ctx.app_version)
        }
        .await;
        match fetched {
            Ok((meta, changed)) => {
                let previews_failed = fetch_previews(ctx, &meta).await?;
                return Ok(Refreshed {
                    changed,
                    previews_failed,
                });
            }
            Err(e @ AppError::Cancelled(_)) => return Err(e),
            Err(e) if best.as_ref().is_none_or(|b| rank(&e) > rank(b)) => best = Some(e),
            Err(_) => {}
        }
    }
    Err(best.unwrap_or_else(|| AppError::Network("No catalog host answered.".into())))
}

async fn fetch_previews(ctx: &Ctx<'_>, meta: &IndexMeta) -> AppResult<usize> {
    let mut failed = 0;
    for pack in meta.preview_pack_ids() {
        if previews::complete(ctx.lib, meta, pack) {
            continue;
        }
        match fetch_pack(ctx, meta, pack, &mut |_, _| {}).await {
            Ok(path) => {
                let installed = previews::install(ctx.lib, &path, meta, pack);
                let _ = std::fs::remove_file(&path);
                failed += usize::from(installed.is_err());
            }
            Err(e @ AppError::Cancelled(_)) => return Err(e),
            Err(_) => failed += 1,
        }
    }
    Ok(failed)
}

/// A pack the index lists, downloaded and checked: `downloads/<sha256>.stvdpack`.
pub async fn fetch_pack(
    ctx: &Ctx<'_>,
    meta: &IndexMeta,
    pack: &str,
    progress: &mut (dyn FnMut(u64, u64) + Send),
) -> AppResult<PathBuf> {
    let entry = meta
        .packs
        .get(pack)
        .filter(|e| e.sha256 == pack)
        .ok_or_else(|| AppError::InvalidInput("The catalog does not list that pack.".into()))?;
    let dir = ctx.lib.downloads_dir();
    std::fs::create_dir_all(&dir)?;
    space::ensure(&dir, space::needed(entry.bytes, entry.uncompressed_bytes))?;
    let part = dir.join(format!("{pack}.part"));
    let done = dir.join(format!("{pack}.stvdpack"));
    let want = Expect {
        bytes: entry.bytes,
        sha256: pack,
    };
    let mut best: Option<AppError> = None;
    for base in ctx.source.pack_bases(ctx.mirror, &meta.mirrors) {
        let url = format!("{base}{}", entry.url);
        match download(ctx.client, &url, &part, &want, ctx.cancel, progress).await {
            Ok(()) => {
                std::fs::rename(&part, &done)?;
                return Ok(done);
            }
            Err(e @ AppError::Cancelled(_)) => return Err(e),
            Err(e) => {
                if best.as_ref().is_none_or(|b| rank(&e) > rank(b)) {
                    best = Some(e);
                }
            }
        }
    }
    Err(best.unwrap_or_else(|| AppError::Network("No host serves that pack.".into())))
}
