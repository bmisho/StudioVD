//! Downloaded zips (PLAN 16.5): what is unpacked, what is skipped and what is refused.

use super::archive::{unpack, Limits, LIMITS};
use super::expand_archives;
use std::fs;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("studiovd-zip-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("temp dir");
    dir
}

/// A zip of `(name, bytes)` entries (a name ending in `/` is a folder entry), deflated.
fn zip_of(entries: &[(&str, &[u8])]) -> Vec<u8> {
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    for (name, bytes) in entries {
        if name.ends_with('/') {
            zip.add_directory(*name, options).expect("dir");
        } else {
            zip.start_file(*name, options).expect("entry");
            zip.write_all(bytes).expect("bytes");
        }
    }
    zip.finish().expect("zip").into_inner()
}

fn write(dir: &Path, name: &str, bytes: &[u8]) -> PathBuf {
    let path = dir.join(name);
    fs::write(&path, bytes).expect("archive");
    path
}

#[test]
fn unpacks_models_and_their_files_skips_the_rest() {
    let dir = temp_dir("mixed");
    let archive = write(
        &dir,
        "Pedal.zip",
        &zip_of(&[
            ("Pedal/", b""),
            ("Pedal/parts/Pot 16mm.STEP", b"ISO-10303-21;"),
            ("Pedal/parts/Pédale boîtier.stp", b"ISO-10303-21;"),
            ("Pedal/knob.obj", b"mtllib knob.mtl\n"),
            ("Pedal/knob.mtl", b"newmtl a\n"),
            ("Pedal/Pedal.SLDASM", b"native"),
            ("Pedal/readme.pdf", b"%PDF"),
            ("__MACOSX/Pedal/._knob.obj", b"fork"),
        ]),
    );
    let out = unpack(&archive, &dir.join("out"), &LIMITS).expect("unpacked");
    let mut models: Vec<String> = out
        .models
        .iter()
        .map(|p| {
            p.strip_prefix(dir.join("out"))
                .expect("inside")
                .to_string_lossy()
                .replace('\\', "/")
        })
        .collect();
    models.sort();
    assert_eq!(
        models,
        [
            "Pedal/knob.obj",
            "Pedal/parts/Pot 16mm.STEP",
            "Pedal/parts/Pédale boîtier.stp"
        ]
    );
    // The OBJ's material library came along (its sibling), but is not offered as a model.
    assert!(dir.join("out/Pedal/knob.mtl").is_file());
    assert_eq!(out.skipped, ["Pedal/Pedal.SLDASM", "Pedal/readme.pdf"]);
}

#[test]
fn never_writes_outside_its_folder() {
    let dir = temp_dir("names");
    let archive = write(
        &dir,
        "evil.zip",
        &zip_of(&[
            ("../escape.step", b"x"),
            ("/abs.step", b"x"),
            ("C:/drive.step", b"x"),
            ("sub/../../up.step", b"x"),
            ("con.step", b"x"),
            ("a:b.step", b"x"),
            ("trailing.step.", b"x"),
            ("ok.step", b"x"),
            ("OK.STEP", b"x"),
        ]),
    );
    let out = unpack(&archive, &dir.join("out"), &LIMITS).expect("unpacked");
    assert_eq!(out.models, [dir.join("out/ok.step")]);
    assert_eq!(out.skipped.len(), 8);
    assert!(!dir.join("escape.step").exists() && !dir.join("up.step").exists());
}

#[test]
fn refuses_archives_that_expand_too_much_and_leaves_nothing() {
    let dir = temp_dir("bomb");
    let zeros = vec![0u8; 2 << 20]; // 2 MiB of zeros deflate to a few kB
    let archive = write(&dir, "bomb.zip", &zip_of(&[("big.stl", &zeros)]));
    let tight = Limits {
        ratio_floor_bytes: 1 << 20,
        max_ratio: 10,
        ..LIMITS
    };
    let err = unpack(&archive, &dir.join("out"), &tight).expect_err("refused");
    assert!(err.to_string().contains("expands too much"), "{err}");
    assert!(!dir.join("out").exists());
    // The same archive within the normal limits.
    assert_eq!(
        unpack(&archive, &dir.join("ok"), &LIMITS)
            .expect("ok")
            .models
            .len(),
        1
    );
}

#[test]
fn expands_zips_among_dropped_paths() {
    let dir = temp_dir("expand");
    let plain = write(&dir, "bracket.stl", b"solid");
    let archive = write(
        &dir,
        "Knobs.zip",
        &zip_of(&[("knob.step", b"x"), ("knob.ipt", b"x")]),
    );
    let broken = write(&dir, "broken.zip", b"not a zip");
    let (paths, skipped) = expand_archives(
        &[plain.clone(), archive, broken],
        Some(&dir.join("imports")),
    );
    assert_eq!(paths.len(), 2);
    assert_eq!(paths[0], plain);
    assert!(paths[1].ends_with("knob.step") && paths[1].starts_with(dir.join("imports")));
    assert_eq!(skipped[0], "Knobs.zip: knob.ipt");
    assert!(skipped[1].starts_with("broken.zip ("), "{skipped:?}");
}

#[test]
fn accepts_streamed_zips_that_the_project_guard_refuses() {
    // Zips written on the fly (a website's download) use data descriptors: sizes and CRC
    // after the data. .stvd files may not; downloads may.
    let dir = temp_dir("stream");
    let mut zip = ZipWriter::new_stream(Vec::new());
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    zip.start_file("part.step", options).expect("entry");
    zip.write_all(b"ISO-10303-21;").expect("bytes");
    let bytes = zip.finish().expect("zip").into_inner();
    let archive = write(&dir, "download.zip", &bytes);
    let guard = crate::bundle::guard::Limits {
        max_archive_bytes: 1 << 20,
        max_entries: 10,
        max_total_bytes: 1 << 20,
        max_ratio: 100,
        ratio_floor_bytes: 1 << 20,
        max_name_len: 200,
    };
    let strict =
        crate::bundle::guard::inspect_zip(fs::File::open(&archive).expect("open"), &guard, |_| {
            Some(1 << 20)
        });
    assert!(
        strict.is_err(),
        "the project guard refuses data descriptors"
    );
    let out = unpack(&archive, &dir.join("out"), &LIMITS).expect("unpacked");
    assert_eq!(out.models, [dir.join("out/part.step")]);
    assert_eq!(
        fs::read(dir.join("out/part.step")).expect("read"),
        b"ISO-10303-21;"
    );
}
