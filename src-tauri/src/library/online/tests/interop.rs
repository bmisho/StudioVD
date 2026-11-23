//! Real minisign output (PLAN 14.2): `fixtures/minisign/` holds an index built by the catalog
//! repository's `tools/build-index.mjs` and signed by minisign 0.11 (the version its publish
//! workflow installs) with a throwaway key, exactly as the workflow signs. The cargo tests'
//! own signer only imitates minisign; this pins the real thing.
//!
//! `live_official_catalog` checks the published catalog with the compiled-in keys. It needs
//! the files on disk (the tests make no network requests):
//!
//! ```sh
//! d=$(mktemp -d); b=https://github.com/bmisho/studiovd-catalog/releases/latest/download
//! curl -fsSL -o $d/index.json $b/index.json && curl -fsSL -o $d/index.json.minisig $b/index.json.minisig
//! STUDIOVD_LIVE_INDEX=$d cargo test --locked live_official_catalog -- --ignored
//! ```

use crate::library::online::signed::verify_index;
use crate::library::online::source::OFFICIAL;

const INDEX: &[u8] = include_bytes!("fixtures/minisign/index.json");
const SIGNATURE: &[u8] = include_bytes!("fixtures/minisign/signature.minisig");
const PUBLIC: &str = include_str!("fixtures/minisign/key.pub");

fn public_key() -> &'static str {
    PUBLIC.lines().nth(1).unwrap_or_default()
}

#[test]
fn minisign_signed_index_verifies() {
    let meta = verify_index(INDEX, SIGNATURE, &[public_key()]).expect("verified");
    assert_eq!(
        (
            meta.catalog_id.as_str(),
            meta.sequence,
            meta.signing_key_id.as_str()
        ),
        ("official", 1, "6FEA78BE67AB28D8")
    );
}

#[test]
fn minisign_signature_binds_every_byte() {
    let mut changed = INDEX.to_vec();
    let at = changed.len() - 3;
    changed[at] ^= 1;
    assert!(verify_index(&changed, SIGNATURE, &[public_key()]).is_err());
    assert!(verify_index(INDEX, SIGNATURE, OFFICIAL.keys).is_err()); // not the official keys
}

#[test]
#[ignore = "needs the published index on disk (STUDIOVD_LIVE_INDEX); see the module docs"]
fn live_official_catalog() {
    let dir = std::path::PathBuf::from(std::env::var("STUDIOVD_LIVE_INDEX").unwrap_or_default());
    let index = std::fs::read(dir.join("index.json")).expect("index.json");
    let sig = std::fs::read(dir.join("index.json.minisig")).expect("index.json.minisig");
    let meta = verify_index(&index, &sig, OFFICIAL.keys).expect("verified by an official key");
    assert_eq!(meta.catalog_id, OFFICIAL.id);
    println!(
        "official catalog: sequence {}, expires {}",
        meta.sequence, meta.expires_at
    );
}
