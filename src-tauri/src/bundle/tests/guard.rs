//! The generic guard refuses every hostile archive shape it knows about.

use super::raw::{any_name, entry, raw_zip, refusal, temp, RawEntry, LIMITS};
use crate::bundle::guard::{extract_zip, Limits};
use crate::workspace::sha256_hex;
use std::fs;
use std::io::Cursor;

#[test]
fn accepts_a_plain_archive_and_hashes_what_it_writes() {
    let base = temp("plain");
    let zip = raw_zip(&[entry("scene.json", b"{}"), entry("geometry/a.glb", b"glb")]);
    let out = extract_zip(Cursor::new(zip), &base.join("out"), &LIMITS, any_name).expect("ok");
    assert_eq!(out.len(), 2);
    assert_eq!(
        fs::read(base.join("out/geometry/a.glb")).expect("read"),
        b"glb"
    );
    assert_eq!(crate::workspace::hex(&out[1].sha256), sha256_hex(b"glb"));
    let _ = fs::remove_dir_all(base);
}

#[test]
fn refuses_zip_slip_and_unsafe_names() {
    for name in [
        "../up.txt",
        "/abs.txt",
        "a/../b.txt",
        "C:/drive.txt",
        "C:x.txt",
        "a\\b.txt",
        "a/b:ads",
        "CON.json",
        "lpt1",
        "geometry/.hidden",
        "trailing.",
        "a//b",
        "",
        "ü.txt",
    ] {
        let why = refusal(raw_zip(&[entry(name, b"x")]));
        assert!(why.is_some(), "accepted {name:?}");
    }
    assert!(refusal(raw_zip(&[RawEntry {
        name: vec![0xff, b'a'],
        ..entry("", b"x")
    }]))
    .is_some());
}

#[test]
fn refuses_symlinks_folders_and_other_file_types() {
    for mode in [0o120_777u32, 0o040_755, 0o060_644, 0o010_644] {
        let link = RawEntry {
            external_attributes: mode << 16,
            ..entry("geometry/link", b"/etc/passwd")
        };
        assert!(
            refusal(raw_zip(&[link])).is_some(),
            "accepted mode {mode:o}"
        );
    }
    assert!(refusal(raw_zip(&[entry("folder/", b"")])).is_some());
}

#[test]
fn refuses_truncated_archives_and_extra_bytes() {
    let good = raw_zip(&[entry("scene.json", b"{\"a\":1}")]);
    for cut in [0, 10, good.len() / 2, good.len() - 1] {
        assert!(
            refusal(good[..cut].to_vec()).is_some(),
            "accepted a cut at {cut}"
        );
    }
    let mut prefixed = b"MZ junk".to_vec();
    prefixed.extend(&good);
    assert!(refusal(prefixed).is_some());
    let mut trailing = good.clone();
    trailing.extend(b"junk");
    assert!(refusal(trailing).is_some());
}

#[test]
fn refuses_ratio_bombs_and_size_lies() {
    let bomb = RawEntry {
        deflate: true,
        ..entry("geometry/b.glb", &vec![0u8; 3 << 20])
    };
    let why = refusal(raw_zip(&[bomb])).expect("bomb refused");
    assert!(why.contains("expands too much"), "{why}");
    // Claims more than it holds: the crate itself stops at the real end without an error.
    let long = RawEntry {
        claimed_size: Some(5000),
        deflate: true,
        ..entry("a.txt", &[7u8; 1000])
    };
    assert!(refusal(raw_zip(&[long])).is_some());
    let short = RawEntry {
        claimed_size: Some(10),
        deflate: true,
        ..entry("a.txt", &[7u8; 1000])
    };
    assert!(refusal(raw_zip(&[short])).is_some());
}

#[test]
fn refuses_duplicates_crc_errors_and_data_descriptors() {
    let dup = raw_zip(&[entry("scene.json", b"1"), entry("scene.json", b"2")]);
    assert!(refusal(dup).is_some());
    let case = raw_zip(&[entry("Scene.json", b"1"), entry("scene.json", b"2")]);
    assert!(refusal(case).is_some());
    let clash = raw_zip(&[entry("a", b"1"), entry("a/b", b"2")]);
    assert!(refusal(clash).is_some());
    let mut crc = raw_zip(&[entry("a.txt", b"hello world")]);
    let at = crc.windows(5).position(|w| w == b"hello").expect("payload");
    crc[at] ^= 1;
    assert!(refusal(crc).is_some());
    let descriptor = RawEntry {
        flags: 0x08,
        ..entry("a.txt", b"x")
    };
    assert!(refusal(raw_zip(&[descriptor])).is_some());
}

#[test]
fn many_small_entries_share_one_expansion_budget() {
    // Each entry alone is under the floor; together they expand far past the archive's budget.
    let limits = Limits {
        max_ratio: 10,
        ..LIMITS
    };
    let entries: Vec<RawEntry> = (0..16)
        .map(|i| RawEntry {
            deflate: true,
            ..entry(&format!("geometry/{i}.glb"), &[0u8; 4096])
        })
        .collect();
    let zip = raw_zip(&entries);
    assert!((zip.len() as u64) * 10 < 16 * 4096, "the archive is small");
    let base = temp("budget");
    let result = extract_zip(Cursor::new(zip), &base.join("out"), &limits, any_name);
    let why = result.err().map(|e| e.to_string()).unwrap_or_default();
    assert!(why.contains("expands too much"), "{why}");
    let _ = fs::remove_dir_all(base);
}

#[test]
fn refuses_central_records_the_directory_does_not_count() {
    // One counted record, plus a hidden second one (another zip tool would list it) that
    // points back at the same local entry.
    let mut zip = raw_zip(&[entry("scene.json", b"{}")]);
    let cd = zip
        .windows(4)
        .position(|w| w == [0x50, 0x4b, 0x01, 0x02])
        .expect("central record");
    let eocd = zip.len() - 22;
    let mut hidden = zip[cd..eocd].to_vec();
    let name = b"../evil.sh";
    hidden.truncate(46);
    hidden[28..30].copy_from_slice(&(name.len() as u16).to_le_bytes());
    hidden.extend(name);
    let cd_size = (eocd - cd + hidden.len()) as u32;
    zip.splice(eocd..eocd, hidden);
    let eocd = zip.len() - 22;
    zip[eocd + 12..eocd + 16].copy_from_slice(&cd_size.to_le_bytes());
    let why = refusal(zip).expect("refused");
    assert!(why.contains("does not count"), "{why}");
}
