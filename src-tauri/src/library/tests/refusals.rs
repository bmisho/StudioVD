//! Packs refused before anything reaches the store.

use super::{glb, setup, write, Pack};
use crate::bundle::tests::raw::{entry, RawEntry};
use crate::library::commit::{cancel, commit};
use crate::library::install::stage_pack;
use crate::library::packfile::parse_pack_manifest;
use crate::workspace::sha256_hex;
use crate::workspace::texture::tests::png;
use std::fs;

fn refusal(pack: &Pack, extra: &[RawEntry], listed: Option<String>) -> String {
    let (lib, dir) = setup("refuse");
    let result = stage_pack(&lib, &write(&dir, pack.zip(extra, listed)));
    let left = fs::read_dir(lib.staging_dir()).expect("staging").count();
    assert_eq!(left, 0, "a refused pack leaves nothing staged");
    match result {
        Ok(_) => String::new(),
        Err(e) => format!("{e:?}"),
    }
}

#[test]
fn refuses_packs_that_do_not_match_their_list() {
    let pack = Pack::new("acme/knob");
    let unlisted = entry(&format!("licenses/{}.txt", "9".repeat(64)), b"x");
    assert!(refusal(&pack, &[unlisted], None).contains("not listed"));
    assert!(refusal(&pack, &[entry("scripts/run.js", b"x")], None).contains("unexpected entry"));
    assert!(refusal(&pack, &[entry("../evil.txt", b"x")], None).contains("forbidden"));
    let lying = pack.pack_json().replacen("\"bytes\":", "\"bytes\":1", 1);
    assert!(refusal(&pack, &[], Some(lying)).contains("does not match"));
    let mut missing = Pack::new("acme/knob");
    missing.files.pop(); // the licence listed below is not in the zip
    let listed = Pack::new("acme/knob").pack_json();
    assert!(refusal(&missing, &[], Some(listed)).contains("does not hold"));
}

#[test]
fn refuses_reserved_namespaces_and_bad_contents() {
    assert!(refusal(&Pack::new("official/knob"), &[], None).contains("reserved"));
    let mut outside = Pack::new("acme/knob");
    let g = glb(r#"{"asset":{"version":"2.0"},"buffers":[{"uri":"https://example.com/x.bin"}]}"#);
    outside.files[2] = (format!("geometry/{}.glb", sha256_hex(&g)), g);
    assert!(refusal(&outside, &[], None).contains("external"));
    let mut big = Pack::new("acme/knob");
    big.files[1].1 = png(1024, 1024);
    assert!(refusal(&big, &[], None).contains("512 px"));
}

#[test]
fn keeps_one_content_per_installed_version_and_cancels_cleanly() {
    let (lib, dir) = setup("versions");
    let first = Pack::new("acme/knob");
    let (staged, _) = stage_pack(&lib, &write(&dir, first.zip(&[], None))).expect("staged");
    commit(&lib, staged, 1).expect("installed");
    let mut other = Pack::new("acme/knob");
    other.files[0].1.extend_from_slice(b" ");
    let (staged, _) = stage_pack(&lib, &write(&dir, other.zip(&[], None))).expect("staged");
    let err = commit(&lib, staged, 2).expect_err("other content");
    assert!(format!("{err:?}").contains("already installed"));
    let (staged, _) = stage_pack(&lib, &write(&dir, first.zip(&[], None))).expect("staged");
    cancel(staged);
    assert_eq!(fs::read_dir(lib.staging_dir()).expect("staging").count(), 0);
}

#[test]
fn reads_the_shared_pack_fixture() {
    let fixture =
        fs::read("../src/core/schema/testing/fixtures/library/pack.valid.json").expect("fixture");
    let pack = parse_pack_manifest(&fixture).expect("valid");
    assert_eq!((pack.components.len(), pack.files.len()), (1, 5));
    let renamed = String::from_utf8(fixture)
        .expect("utf8")
        .replace("geometry/aaaa", "geometry/bbbb");
    assert!(parse_pack_manifest(renamed.as_bytes()).is_err()); // not named by its hash
}

/// PLAN 9.9: the zip guard's refusals hold on the pack path too, and leave nothing staged.
#[test]
fn refuses_symlinks_bombs_and_device_names() {
    let pack = Pack::new("acme/knob");
    let link = RawEntry {
        external_attributes: 0o120_777 << 16,
        ..entry(&format!("licenses/{}.txt", "9".repeat(64)), b"/etc/passwd")
    };
    assert!(!refusal(&pack, &[link], None).is_empty(), "a symlink");

    // Two GLB-sized runs of zeros: each within its own cap, together a 1000:1 expansion.
    let zeros = vec![0u8; 40 << 20];
    let bombs: Vec<RawEntry> = ["1", "2"]
        .iter()
        .map(|n| RawEntry {
            deflate: true,
            ..entry(&format!("geometry/{}.glb", n.repeat(64)), &zeros)
        })
        .collect();
    let why = refusal(&pack, &bombs, None);
    assert!(why.contains("expands too much"), "{why}");
    // One file larger than its kind allows, however small it is in the archive.
    let fat = RawEntry {
        deflate: true,
        ..entry(
            &format!("licenses/{}.txt", "3".repeat(64)),
            &zeros[..2 << 20],
        )
    };
    assert!(
        !refusal(&pack, &[fat], None).is_empty(),
        "an oversized text"
    );

    // A Windows device name as a folder: refused on every platform.
    let device = entry("components/acme/con/1.0.0/component.json", b"{}");
    let why = refusal(&pack, &[device], None);
    assert!(
        why.contains("forbidden") || why.contains("reserved"),
        "{why}"
    );
}
