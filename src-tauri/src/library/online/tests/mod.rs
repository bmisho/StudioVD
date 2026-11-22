//! Phase 14 tests (PLAN 14.9): the downloader against a mock HTTP server, signatures made
//! with test keys, the rollback and freeze guards, and refresh → download → install end to end.

mod catalog;
mod fetch;
mod guards;
mod mock;
mod sign;

use crate::bundle::tests::raw::{entry, raw_zip, temp};
use crate::library::online::source::CatalogSource;
use crate::library::tests::Pack;
use crate::net::client::{build, ClientConfig};
use crate::net::settings::{NetworkSettings, ProxySetting};
use crate::workspace::sha256_hex;
use crate::workspace::texture::tests::png;
use sign::{comment, TestKey};
use std::path::PathBuf;

/// A client for the local mock server: plain http, no proxy (the sandbox may set one).
pub fn client() -> reqwest::Client {
    let settings = NetworkSettings {
        proxy: ProxySetting::None,
        consented: true,
        ..NetworkSettings::default()
    };
    build(&ClientConfig {
        settings: &settings,
        extra_ca_pem: None,
        allow_http: true,
    })
    .expect("client")
}

pub fn temp_dir(name: &str) -> PathBuf {
    let dir = temp(name);
    std::fs::create_dir_all(&dir).expect("temp");
    dir
}

/// A catalog with one pack (`official/led`) and one preview pack, signed by `key`.
pub struct Fixture {
    pub pack: Vec<u8>,
    pub pack_sha: String,
    pub preview: Vec<u8>,
    pub preview_sha: String,
    pub thumb_sha: String,
    pub manifest_sha: String,
}

impl Fixture {
    pub fn new() -> Self {
        let pack = Pack::new("official/led");
        let manifest_sha = sha256_hex(&pack.files[0].1);
        let zip = pack.zip(&[], None);
        let thumb = png(64, 64);
        let preview = raw_zip(&[entry("thumbs/led.png", &thumb)]);
        Self {
            pack_sha: sha256_hex(&zip),
            pack: zip,
            preview_sha: sha256_hex(&preview),
            preview,
            thumb_sha: sha256_hex(&thumb),
            manifest_sha,
        }
    }

    /// The index JSON, as the catalog publishes it.
    pub fn index(&self, key: &TestKey, sequence: u64, expires: &str) -> Vec<u8> {
        let pack_entry = |sha: &str, url: &str, len: usize| {
            serde_json::json!({ "url": url, "sha256": sha, "bytes": len,
                "uncompressedBytes": len * 4, "entries": 6 })
        };
        let mut packs = serde_json::Map::new();
        packs.insert(
            self.pack_sha.clone(),
            pack_entry(&self.pack_sha, "v1/led.stvdpack", self.pack.len()),
        );
        packs.insert(
            self.preview_sha.clone(),
            pack_entry(&self.preview_sha, "v1/previews.zip", self.preview.len()),
        );
        serde_json::to_vec(&serde_json::json!({
            "format": "studiovd-catalog", "schemaVersion": 1, "catalogId": "official",
            "sequence": sequence, "generatedAt": "2026-01-01T00:00:00Z", "expiresAt": expires,
            "minAppVersion": "0.1.0", "signingKeyId": key.id(),
            "mirrors": ["https://mirror.invalid/"], "categories": [],
            "components": [{ "id": "official/led", "version": "1.0.0",
                "manifestSha256": self.manifest_sha, "pack": self.pack_sha,
                "thumbnail": { "pack": self.preview_sha, "path": "thumbs/led.png",
                    "sha256": self.thumb_sha } }],
            "packs": packs, "bundles": [], "previewPacks": { "electronic": self.preview_sha },
            "generatorPresets": [], "revoked": [], "notices": []
        }))
        .expect("json")
    }

    /// The index and its signature.
    pub fn signed(&self, key: &TestKey, sequence: u64, expires: &str) -> (Vec<u8>, Vec<u8>) {
        let index = self.index(key, sequence, expires);
        let sig = key.sign(&index, &comment("official", sequence));
        (index, sig.into_bytes())
    }
}

/// A source with test keys and hosts (leaked: sources are `'static` in the app).
pub fn source(keys: &[&TestKey], index_base: &str, pack_bases: &[&str]) -> &'static CatalogSource {
    let keys: Vec<&'static str> = keys
        .iter()
        .map(|k| &*Box::leak(k.public().into_boxed_str()))
        .collect();
    let leak = |s: &str| -> &'static str { Box::leak(s.to_owned().into_boxed_str()) };
    let packs: Vec<&'static str> = pack_bases.iter().map(|b| leak(b)).collect();
    Box::leak(Box::new(CatalogSource {
        id: "official",
        keys: Box::leak(keys.into_boxed_slice()),
        index_bases: Box::leak(vec![leak(index_base)].into_boxed_slice()),
        pack_bases: Box::leak(packs.into_boxed_slice()),
    }))
}

pub const FAR: &str = "2099-01-01T00:00:00Z";
pub const NOW: u64 = 1_790_000_000; // 2026-09-21
