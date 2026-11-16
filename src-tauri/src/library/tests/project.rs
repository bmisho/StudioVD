//! Save as component, Add to my library and Export pack (PLAN 9.7): a manifest built from the
//! project, its files taken from the workspace, exported as a pack that installs again.

use super::{glb, setup};
use crate::library::commit::commit;
use crate::library::export::{export_pack, iso_utc};
use crate::library::from_project::{add_from_project, geometry_sizes};
use crate::library::install::stage_pack;
use crate::library::installed::Origin;
use crate::library::{publisher, Library};
use crate::workspace::sha256_hex;
use crate::workspace::texture::tests::png;
use std::fs;
use std::path::{Path, PathBuf};

struct Project {
    bundle: PathBuf,
    geometry: String,
    bytes: usize,
    texture: String,
    licence: String,
}

/// A workspace holding one GLB, one texture and one licence text.
fn project(dir: &Path) -> Project {
    let bundle = dir.join("bundle");
    let files = [
        ("geometry", "glb", glb(r#"{"asset":{"version":"2.0"}}"#)),
        ("textures", "png", png(32, 32)),
        ("licenses", "txt", b"CC BY 4.0 legal code".to_vec()),
    ];
    let mut names = Vec::new();
    for (folder, ext, bytes) in &files {
        fs::create_dir_all(bundle.join(folder)).expect("folder");
        let name = format!("{folder}/{}.{ext}", sha256_hex(bytes));
        fs::write(bundle.join(&name), bytes).expect("file");
        names.push(name);
    }
    Project {
        bundle,
        bytes: files[0].2.len(),
        geometry: names[0].clone(),
        texture: names[1].clone(),
        licence: names[2].clone(),
    }
}

fn manifest(p: &Project, id: &str, version: &str, bytes: usize) -> String {
    format!(
        r#"{{"identity":{{"id":"{id}","version":"{version}"}},"parts":{{"a":{{"geometry":{{"kind":"asset","path":"{}","bytes":{bytes}}}}}}},"map":"{}","text":"{}","thumbnails":[]}}"#,
        p.geometry, p.texture, p.licence
    )
}

fn error(result: crate::error::AppResult<impl Sized>) -> String {
    match result {
        Ok(_) => String::new(),
        Err(e) => format!("{e:?}"),
    }
}

#[test]
fn saves_harvests_exports_and_installs_again() {
    let (lib, dir) = setup("from-project");
    let p = project(&dir);
    let ns = publisher::namespace(&lib).expect("namespace");
    assert_eq!(
        geometry_sizes(&p.bundle, std::slice::from_ref(&p.geometry)).expect("sizes"),
        vec![p.bytes as u64]
    );
    let own = manifest(&p, &format!("{ns}/bracket"), "1.0.0", p.bytes);
    let all = add_from_project(&lib, &p.bundle, &own, 10).expect("saved");
    assert_eq!(all.len(), 1);
    assert_eq!(all[0].origin, Origin::User);
    assert_eq!(
        all[0].blobs,
        vec![p.geometry.clone(), p.licence.clone(), p.texture.clone()]
    );
    for blob in &all[0].blobs {
        assert!(lib.store_dir().join(blob).is_file(), "{blob}");
    }
    // The same text again is already there; other text under that version is refused.
    assert_eq!(
        add_from_project(&lib, &p.bundle, &own, 11).expect("again"),
        all
    );
    let changed = own.replace("\"map\"", "\"other\"");
    assert!(error(add_from_project(&lib, &p.bundle, &changed, 12)).contains("new version"));

    // Someone else's component, harvested from their project: unverified.
    let theirs = manifest(&p, "acme/knob", "2.1.0", p.bytes);
    let all = add_from_project(&lib, &p.bundle, &theirs, 13).expect("harvested");
    let knob = all.iter().find(|c| c.id == "acme/knob").expect("knob");
    assert_eq!(knob.origin, Origin::Sideloaded);

    // Both as one pack (shared files once), the same bytes every time.
    let refs = [
        (format!("{ns}/bracket"), "1.0.0".to_owned()),
        ("acme/knob".to_owned(), "2.1.0".to_owned()),
    ];
    let target = dir.join("out.stvdpack");
    let summary = export_pack(&lib, &refs, &target, 1_793_000_000, "0.1.0").expect("exported");
    assert_eq!((summary.components, summary.files), (2, 5));
    let again = dir.join("again.stvdpack");
    export_pack(&lib, &refs, &again, 1_793_000_000, "0.1.0").expect("exported again");
    assert_eq!(fs::read(&target).expect("a"), fs::read(&again).expect("b"));

    // Install from file reads it in another library, every file checked.
    let other = Library::open(&dir.join("other-library")).expect("other");
    let (staged, staged_summary) = stage_pack(&other, &target).expect("staged");
    assert_eq!(
        (staged_summary.components.len(), staged_summary.files),
        (2, 5)
    );
    assert_eq!(staged_summary.components[1].manifest, own);
    let installed = commit(&other, staged, 20).expect("installed");
    assert_eq!(installed.len(), 2);
    assert!(installed.iter().all(|c| c.origin == Origin::Sideloaded));
}

#[test]
fn refuses_what_a_pack_would_refuse() {
    let (lib, dir) = setup("from-project-refusals");
    let p = project(&dir);
    let ns = publisher::namespace(&lib).expect("namespace");
    let id = format!("{ns}/bracket");
    let add = |text: &str| error(add_from_project(&lib, &p.bundle, text, 1));
    assert!(add(&manifest(&p, "official/bracket", "1.0.0", p.bytes)).contains("signed catalogs"));
    assert!(add(&manifest(&p, "Bad Id", "1.0.0", p.bytes)).contains("no valid id"));
    assert!(add(&manifest(&p, &id, "1.0.0", p.bytes + 1)).contains("size recorded"));
    assert!(add(&manifest(&p, &id, "1.0.0", p.bytes).replace("[]", "[{}]")).contains("thumbnails"));
    assert!(add("not json").contains("not JSON"));
    let device = manifest(&p, &format!("{ns}/con"), "1.0.0", p.bytes);
    assert!(add(&device).contains("folder name"));

    let missing = manifest(&p, &id, "1.0.0", p.bytes)
        .replace(&p.licence, &format!("licenses/{}.txt", "a".repeat(64)));
    assert!(add(&missing).contains("no longer holds"));
    // A file whose content no longer matches its name, and one that is not what it says.
    fs::write(p.bundle.join(&p.licence), b"tampered").expect("tamper");
    assert!(add(&manifest(&p, &id, "1.0.0", p.bytes)).contains("damaged"));
    let fake = b"not a glb".to_vec();
    let fake_name = format!("geometry/{}.glb", sha256_hex(&fake));
    fs::write(p.bundle.join(&fake_name), &fake).expect("fake");
    let text = format!(
        r#"{{"identity":{{"id":"{id}","version":"1.0.1"}},"g":{{"kind":"asset","path":"{fake_name}","bytes":{}}}}}"#,
        fake.len()
    );
    assert!(!add(&text).is_empty());
    assert!(
        error(geometry_sizes(&p.bundle, std::slice::from_ref(&p.texture)))
            .contains("not a geometry")
    );
    assert!(
        lib.store_dir().join(&p.geometry).metadata().is_err(),
        "nothing reached the store"
    );
}

#[test]
fn writes_utc_timestamps() {
    assert_eq!(iso_utc(0), "1970-01-01T00:00:00Z");
    assert_eq!(iso_utc(951_782_400), "2000-02-29T00:00:00Z");
    assert_eq!(iso_utc(1_793_000_000), "2026-10-26T07:33:20Z");
    assert_eq!(iso_utc(4_107_542_399), "2100-02-28T23:59:59Z");
}
