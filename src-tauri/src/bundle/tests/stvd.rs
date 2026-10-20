//! The `.stvd` format: deterministic saves that reopen, and refusals on either side.

use super::raw::{entry, raw_zip, temp};
use crate::bundle::stvd;
use crate::workspace::sha256_hex;
use crate::workspace::texture::tests::{hidden_frame_jpeg, jpeg, png};
use std::fs;

#[test]
fn a_saved_project_reopens_byte_for_byte() {
    let base = temp("roundtrip");
    let bundle = base.join("ws/bundle");
    fs::create_dir_all(bundle.join("geometry")).expect("bundle");
    let glb = b"glTF fake mesh".repeat(100);
    let id = sha256_hex(&glb);
    fs::write(bundle.join(format!("geometry/{id}.glb")), &glb).expect("asset");
    let scene = format!(
        r#"{{"assets":{{"{id}":{{"path":"geometry/{id}.glb"}}}},"textures":{{}},"licenseTexts":{{}}}}"#
    );
    let png = [b"\x89PNG\r\n\x1a\n".as_slice(), b"pixels"].concat();
    let target = base.join("robot.stvd");
    stvd::write(&bundle, scene.as_bytes(), Some(&png), &target).expect("save");
    let first = fs::read(&target).expect("saved");
    stvd::write(&bundle, scene.as_bytes(), Some(&png), &target).expect("save again");
    assert_eq!(
        fs::read(&target).expect("saved"),
        first,
        "deterministic output"
    );

    let opened = base.join("ws2/bundle");
    fs::create_dir_all(base.join("ws2")).expect("ws2");
    let mut names = stvd::extract(&target, &opened).expect("open");
    names.sort();
    assert_eq!(
        names,
        [
            format!("geometry/{id}.glb"),
            "scene.json".into(),
            "thumbnail.png".into()
        ]
    );
    assert_eq!(
        fs::read(opened.join("scene.json")).expect("scene"),
        scene.as_bytes()
    );
    assert_eq!(
        fs::read(opened.join(format!("geometry/{id}.glb"))).expect("glb"),
        glb
    );
    let _ = fs::remove_dir_all(base);
}

#[test]
fn saving_refuses_missing_damaged_or_foreign_files() {
    let base = temp("save-refuse");
    let bundle = base.join("bundle");
    fs::create_dir_all(bundle.join("geometry")).expect("bundle");
    let id = sha256_hex(b"real");
    let scene = |path: &str| {
        format!(
            r#"{{"assets":{{"{id}":{{"path":"{path}"}}}},"textures":{{}},"licenseTexts":{{}}}}"#
        )
    };
    let target = base.join("p.stvd");
    let glb = format!("geometry/{id}.glb");
    assert!(
        stvd::write(&bundle, scene(&glb).as_bytes(), None, &target).is_err(),
        "missing"
    );
    fs::write(bundle.join(&glb), b"tampered").expect("asset");
    assert!(
        stvd::write(&bundle, scene(&glb).as_bytes(), None, &target).is_err(),
        "damaged"
    );
    for path in [
        "../../etc/passwd",
        "geometry/x.glb",
        &format!("textures/{id}.glb"),
    ] {
        assert!(
            stvd::write(&bundle, scene(path).as_bytes(), None, &target).is_err(),
            "{path}"
        );
    }
    assert!(!target.exists(), "nothing written");
    let _ = fs::remove_dir_all(base);
}

#[test]
fn opening_refuses_unknown_entries_and_mismatched_content() {
    let base = temp("open-refuse");
    let open = |zip: Vec<u8>| {
        let path = base.join("p.stvd");
        fs::write(&path, zip).expect("write");
        let dest = base.join("bundle");
        let result = stvd::extract(&path, &dest);
        assert!(result.is_err() == !dest.exists() || result.is_ok());
        let _ = fs::remove_dir_all(&dest);
        result
    };
    assert!(open(raw_zip(&[
        entry("scene.json", b"{}"),
        entry("run.sh", b"x")
    ]))
    .is_err());
    assert!(
        open(raw_zip(&[entry("thumbnail.png", b"x")])).is_err(),
        "no scene.json"
    );
    let wrong = format!("geometry/{}.glb", sha256_hex(b"other"));
    assert!(open(raw_zip(&[
        entry("scene.json", b"{}"),
        entry(&wrong, b"mine")
    ]))
    .is_err());
    let right = format!("geometry/{}.glb", sha256_hex(b"mine"));
    assert!(open(raw_zip(&[
        entry("scene.json", b"{}"),
        entry(&right, b"mine")
    ]))
    .is_ok());
    let _ = fs::remove_dir_all(base);
}

#[test]
fn saving_refuses_a_file_it_could_not_reopen() {
    // 70 MiB of zeros deflates to almost nothing: past the reader's expansion budget, so the
    // save's self-check refuses it and nothing is written.
    let base = temp("save-budget");
    let bundle = base.join("bundle");
    fs::create_dir_all(bundle.join("geometry")).expect("bundle");
    let glb = vec![0u8; 70 << 20];
    let id = sha256_hex(&glb);
    fs::write(bundle.join(format!("geometry/{id}.glb")), &glb).expect("asset");
    let scene = format!(
        r#"{{"assets":{{"{id}":{{"path":"geometry/{id}.glb"}}}},"textures":{{}},"licenseTexts":{{}}}}"#
    );
    let target = base.join("p.stvd");
    let err = stvd::write(&bundle, scene.as_bytes(), None, &target).expect_err("refused");
    assert!(err.to_string().contains("did not check out"), "{err}");
    assert!(!target.exists());
    let leftovers = fs::read_dir(&base).expect("list").count();
    assert_eq!(leftovers, 1, "only the bundle folder, no temp file");
    let _ = fs::remove_dir_all(base);
}

#[test]
fn textures_round_trip_and_are_checked_before_anything_decodes_them() {
    let base = temp("textures");
    let bundle = base.join("ws/bundle");
    fs::create_dir_all(bundle.join("textures")).expect("bundle");
    let image = jpeg(64, 32);
    let id = sha256_hex(&image);
    let path = format!("textures/{id}.jpg");
    fs::write(bundle.join(&path), &image).expect("texture");
    let scene = format!(
        r#"{{"assets":{{}},"textures":{{"{id}":{{"path":"{path}"}}}},"licenseTexts":{{}}}}"#
    );
    let target = base.join("textured.stvd");
    stvd::write(&bundle, scene.as_bytes(), None, &target).expect("save");
    let opened = base.join("ws2/bundle");
    fs::create_dir_all(base.join("ws2")).expect("ws2");
    let names = stvd::extract(&target, &opened).expect("open");
    assert!(names.contains(&path));
    assert_eq!(fs::read(opened.join(&path)).expect("texture"), image);

    let open = |name: String, bytes: &[u8]| {
        let file = base.join("bad.stvd");
        fs::write(
            &file,
            raw_zip(&[entry("scene.json", b"{}"), entry(&name, bytes)]),
        )
        .expect("zip");
        let dest = base.join("bad");
        let result = stvd::extract(&file, &dest);
        let _ = fs::remove_dir_all(&dest);
        result
    };
    let bomb = png(65_535, 65_535); // a few bytes claiming 4 gigapixels
    for (ext, bytes) in [
        ("png", bomb),
        ("png", image.clone()),
        ("jpg", b"GIF89a".to_vec()),
        ("jpg", hidden_frame_jpeg()),
    ] {
        let name = format!("textures/{}.{ext}", sha256_hex(&bytes));
        assert!(open(name.clone(), &bytes).is_err(), "{name}");
    }
    let fine = png(16, 16);
    assert!(open(format!("textures/{}.png", sha256_hex(&fine)), &fine).is_ok());
    let _ = fs::remove_dir_all(base);
}
