//! The content pipeline's gate (PLAN 14.7): the catalog repository builds packs with
//! `tools/packs` and an index for them, then runs this test against those files, so every
//! pack goes through the app's own install path before it is published.
//!
//!   STUDIOVD_CHECK_INDEX=dist/index.json STUDIOVD_CHECK_PACKS=dist/packs \
//!     cargo test --manifest-path src-tauri/Cargo.toml official_packs_install -- --ignored
//!
//! Each content pack is staged as the online catalog stages a download (vouched for by the
//! index: pack and manifest SHA-256), committed, and must install every component it lists
//! as Official; each preview pack must give every thumbnail the index names.

use super::setup;
use crate::library::commit::commit;
use crate::library::install::stage_pack_as;
use crate::library::installed::{self, Origin};
use crate::library::online::meta::IndexMeta;
use crate::library::online::previews;
use crate::library::online::trust::Trust;
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

fn env_path(name: &str) -> PathBuf {
    PathBuf::from(std::env::var(name).unwrap_or_else(|_| panic!("set {name}")))
}

#[test]
#[ignore = "checks packs built by the catalog repository (STUDIOVD_CHECK_INDEX, STUDIOVD_CHECK_PACKS)"]
fn official_packs_install() {
    let index = fs::read(env_path("STUDIOVD_CHECK_INDEX")).expect("index");
    let packs = env_path("STUDIOVD_CHECK_PACKS");
    let meta = IndexMeta::parse(&index).expect("index parses");
    let thumb_packs: HashSet<&str> = meta
        .components
        .iter()
        .map(|c| c.thumbnail.pack.as_str())
        .collect();
    let (lib, _dir) = setup("catalog-check");
    for (sha, entry) in &meta.packs {
        let file = entry.url.rsplit('/').next().expect("file name");
        let path = packs.join(file);
        let bytes = fs::read(&path).unwrap_or_else(|e| panic!("{file}: {e}"));
        assert_eq!(
            bytes.len() as u64,
            entry.bytes,
            "{file}: size differs from the index"
        );
        if thumb_packs.contains(sha.as_str()) {
            let want = meta
                .components
                .iter()
                .filter(|c| c.thumbnail.pack == *sha)
                .count();
            let added = previews::install(&lib, &path, &meta, sha).expect("previews install");
            assert_eq!(added, want, "{file}: thumbnails");
            println!("{file}: {added} thumbnails");
            continue;
        }
        let trust = Trust::Catalog {
            meta: &meta,
            pack: sha,
        };
        let (staged, summary) =
            stage_pack_as(&lib, &path, &trust).unwrap_or_else(|e| panic!("{file}: {e:?}"));
        assert!(summary.verified, "{file}: not verified");
        let listed = meta.components.iter().filter(|c| c.pack == *sha).count();
        assert_eq!(summary.components.len(), listed, "{file}: components");
        commit(&lib, staged, 1_000).unwrap_or_else(|e| panic!("{file}: {e:?}"));
        println!("{file}: {listed} components, {} files", summary.files);
    }
    // Commit returns the whole store; what counts is what the library holds at the end.
    let all = installed::load(&lib);
    assert_eq!(
        all.len(),
        meta.components.len(),
        "every listed component installs"
    );
    assert!(all.iter().all(|c| c.origin == Origin::Official));
}
