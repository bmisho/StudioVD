//! Library tests (PLAN 9.2, 9.9): Install from file end to end; `refusals` has every way a
//! pack is refused before anything reaches the store.

mod catalog_check;
mod project;
mod refusals;

use super::commit::commit;
use super::copy::copy_into_project;
use super::gc::remove;
use super::install::stage_pack;
use super::installed::{self, Origin};
use super::Library;
use crate::bundle::tests::raw::{entry, raw_zip, temp, RawEntry};
use crate::workspace::sha256_hex;
use crate::workspace::texture::tests::png;
use std::fs;
use std::path::PathBuf;

/// The smallest GLB the check accepts: a JSON chunk only.
pub(super) fn glb(json: &str) -> Vec<u8> {
    let mut chunk = json.as_bytes().to_vec();
    while !chunk.len().is_multiple_of(4) {
        chunk.push(b' ');
    }
    let total = 12 + 8 + chunk.len();
    let mut out = b"glTF".to_vec();
    out.extend_from_slice(&2u32.to_le_bytes());
    out.extend_from_slice(&(total as u32).to_le_bytes());
    out.extend_from_slice(&(chunk.len() as u32).to_le_bytes());
    out.extend_from_slice(&0x4E4F_534Au32.to_le_bytes());
    out.extend_from_slice(&chunk);
    out
}

pub(super) struct Pack {
    pub(super) id: &'static str,
    pub(super) files: Vec<(String, Vec<u8>)>,
}

impl Pack {
    /// A one-component pack: manifest, geometry, texture, licence and thumbnail.
    pub(super) fn new(id: &'static str) -> Self {
        let geometry = glb(r#"{"asset":{"version":"2.0"}}"#);
        let texture = png(64, 64);
        let licence = b"MIT License".to_vec();
        let thumb = png(128, 128);
        let (g, t, l) = (
            sha256_hex(&geometry),
            sha256_hex(&texture),
            sha256_hex(&licence),
        );
        let dir = format!("components/{id}/1.0.0");
        let manifest = format!(
            r#"{{"parts":{{"a":{{"geometry":{{"path":"geometry/{g}.glb"}}}}}},"maps":"textures/{t}.png","text":"licenses/{l}.txt","thumb":"{dir}/thumbnail.png"}}"#
        );
        let files = vec![
            (format!("{dir}/component.json"), manifest.into_bytes()),
            (format!("{dir}/thumbnail.png"), thumb),
            (format!("geometry/{g}.glb"), geometry),
            (format!("textures/{t}.png"), texture),
            (format!("licenses/{l}.txt"), licence),
        ];
        Self { id, files }
    }

    pub(super) fn pack_json(&self) -> String {
        let files: Vec<String> = self
            .files
            .iter()
            .map(|(p, b)| {
                format!(
                    r#"{{"path":"{p}","sha256":"{}","bytes":{}}}"#,
                    sha256_hex(b),
                    b.len()
                )
            })
            .collect();
        let manifest = &self.files[0];
        format!(
            r#"{{"format":"studiovd-pack","schemaVersion":1,"createdBy":"test","createdAt":"2026-10-26T09:00:00Z","components":[{{"id":"{}","version":"1.0.0","manifestPath":"{}","manifestSha256":"{}"}}],"files":[{}]}}"#,
            self.id,
            manifest.0,
            sha256_hex(&manifest.1),
            files.join(",")
        )
    }

    /// The zip, with `pack.json` describing the files (or `listed`, when a test lies).
    pub(super) fn zip(&self, extra: &[RawEntry], listed: Option<String>) -> Vec<u8> {
        let mut entries = vec![entry(
            "pack.json",
            listed.unwrap_or_else(|| self.pack_json()).as_bytes(),
        )];
        entries.extend(self.files.iter().map(|(p, b)| entry(p, b)));
        entries.extend_from_slice(extra);
        raw_zip(&entries)
    }
}

pub(super) fn setup(name: &str) -> (Library, PathBuf) {
    let dir = temp(name);
    (Library::open(&dir.join("library")).expect("library"), dir)
}

pub(super) fn write(dir: &std::path::Path, zip: Vec<u8>) -> PathBuf {
    let path = dir.join("pack.stvdpack");
    fs::write(&path, zip).expect("pack");
    path
}

#[test]
fn installs_copies_into_a_project_and_uninstalls() {
    let (lib, dir) = setup("install");
    let pack = Pack::new("acme/knob");
    let (staged, summary) = stage_pack(&lib, &write(&dir, pack.zip(&[], None))).expect("staged");
    assert_eq!(
        (summary.components.len(), summary.files, summary.verified),
        (1, 5, false)
    );
    assert!(summary.components[0].manifest.contains("geometry/"));
    let added = commit(&lib, staged, 1_000).expect("installed");
    assert_eq!(added[0].origin, Origin::Sideloaded);
    assert_eq!(added[0].blobs.len(), 4); // geometry, texture, licence, thumbnail
    assert_eq!(installed::load(&lib), added);
    assert!(fs::read_dir(lib.staging_dir())
        .expect("staging")
        .next()
        .is_none());

    // The index is only a cache: it is rebuilt from the records.
    fs::remove_file(lib.installed_path()).expect("index");
    assert_eq!(installed::load(&lib), added);

    let bundle = dir.join("bundle");
    assert_eq!(
        copy_into_project(&lib, &added[0], &bundle).expect("copied"),
        3
    );
    assert_eq!(
        copy_into_project(&lib, &added[0], &bundle).expect("again"),
        0
    );
    assert!(remove(&lib, "acme/knob", "1.0.0")
        .expect("removed")
        .is_empty());
    for folder in super::BLOB_FOLDERS {
        let left = fs::read_dir(lib.store_dir().join(folder))
            .expect("store")
            .count();
        assert_eq!(left, 0, "{folder}");
    }
}

#[test]
fn a_second_pack_keeps_the_first_in_the_list() {
    let (lib, dir) = setup("two-packs");
    for id in ["acme/knob", "acme/dial"] {
        let (staged, _) =
            stage_pack(&lib, &write(&dir, Pack::new(id).zip(&[], None))).expect("staged");
        commit(&lib, staged, 1).expect("installed");
    }
    let (staged, _) =
        stage_pack(&lib, &write(&dir, Pack::new("acme/lever").zip(&[], None))).expect("staged");
    let all = commit(&lib, staged, 2).expect("installed");
    let ids: Vec<&str> = all.iter().map(|c| c.id.as_str()).collect();
    assert_eq!(ids, ["acme/dial", "acme/knob", "acme/lever"]);
}
