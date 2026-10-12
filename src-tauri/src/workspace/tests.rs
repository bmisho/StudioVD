use super::recovery::{candidates, write_manifest};
use super::sweep::clean_stale;
use super::*;
use std::time::Duration;

const MS: Duration = Duration::from_millis(1);
const LONG: Duration = Duration::from_secs(3600);

fn temp_base(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("studiovd-test-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("temp dir");
    dir
}

#[test]
fn writes_an_asset_under_its_content_address_once() {
    let base = temp_base("write");
    let ws = Workspace::create(&base).expect("workspace");
    let bytes = b"glb bytes";
    let id = sha256_hex(bytes);
    assert!(write_asset(&ws.geometry_dir(), &id, bytes).expect("first write"));
    assert!(!write_asset(&ws.geometry_dir(), &id, bytes).expect("second write is a no-op"));
    let stored = fs::read(ws.geometry_dir().join(format!("{id}.glb"))).expect("stored");
    assert_eq!(stored, bytes);
    let _ = fs::remove_dir_all(base);
}

#[test]
fn rejects_bad_ids_and_mismatched_content() {
    let base = temp_base("reject");
    let ws = Workspace::create(&base).expect("workspace");
    assert_eq!(
        write_asset(&ws.geometry_dir(), "../../etc/passwd", b"x")
            .unwrap_err()
            .kind(),
        "invalidInput"
    );
    assert_eq!(
        write_asset(&ws.geometry_dir(), &"A".repeat(64), b"x")
            .unwrap_err()
            .kind(),
        "invalidInput"
    );
    let other = sha256_hex(b"something else");
    assert_eq!(
        write_asset(&ws.geometry_dir(), &other, b"x")
            .unwrap_err()
            .kind(),
        "invalidInput"
    );
    let _ = fs::remove_dir_all(base);
}

#[test]
fn sha256_matches_a_known_vector() {
    assert_eq!(
        sha256_hex(b"abc"),
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
}

#[test]
fn cleans_only_old_workspaces() {
    let base = temp_base("clean");
    let keep = Workspace::create(&base).expect("current");
    fs::create_dir_all(base.join("ws-old")).expect("old");
    fs::create_dir_all(base.join("unrelated")).expect("unrelated");
    // Everything is "older" than zero seconds except what the filter keeps.
    std::thread::sleep(Duration::from_millis(20));
    let removed = clean_stale(&base, keep.root(), MS, MS);
    assert_eq!(removed, 1);
    assert!(keep.root().is_dir());
    assert!(base.join("unrelated").is_dir());
    let _ = fs::remove_dir_all(base);
}

#[test]
fn never_cleans_a_workspace_another_instance_holds() {
    let base = temp_base("held");
    let current = Workspace::create(&base).expect("current");
    let other = Workspace::create(&base).expect("other running instance");
    std::thread::sleep(Duration::from_millis(20));
    assert_eq!(clean_stale(&base, current.root(), MS, MS), 0);
    assert!(other.root().is_dir());
    let other_root = other.root().to_path_buf();
    drop(other); // that instance exits without cleaning up (a crash)
    assert_eq!(clean_stale(&base, current.root(), MS, MS), 1);
    assert!(!other_root.exists());
    let _ = fs::remove_dir_all(base);
}

#[test]
fn release_keeps_unsaved_work_and_discard_deletes_it() {
    let base = temp_base("release");
    let clean = Workspace::create(&base).expect("clean");
    let clean_root = clean.root().to_path_buf();
    clean.release();
    assert!(!clean_root.exists(), "nothing unsaved: deleted");
    let dirty = Workspace::create(&base).expect("dirty");
    fs::write(dirty.autosave_path(), b"{}").expect("autosave");
    let dirty_root = dirty.root().to_path_buf();
    dirty.release();
    assert!(
        dirty_root.join("autosave.json").is_file(),
        "kept for recovery"
    );
    Workspace::adopt(&dirty_root).expect("adopt").discard();
    assert!(!dirty_root.exists());
    let _ = fs::remove_dir_all(base);
}

#[test]
fn recovery_lists_only_unheld_workspaces_with_an_autosave() {
    let base = temp_base("recover");
    let current = Workspace::create(&base).expect("current");
    let held = Workspace::create(&base).expect("another running instance");
    fs::write(held.autosave_path(), b"{}").expect("autosave");
    let crashed = Workspace::create(&base).expect("crashed");
    let scene = br#"{"project":{"name":"  Robot\u0007 arm "},"parts":{}}"#;
    fs::write(crashed.autosave_path(), scene).expect("autosave");
    write_manifest(&crashed, Some(&base.join("robot.stvd"))).expect("manifest");
    let crashed_root = crashed.root().to_path_buf();
    drop(crashed); // the process died: lock released, folder left behind
    let found = candidates(&base, current.root());
    assert_eq!(found.len(), 1);
    let only = &found[0];
    assert_eq!(only.root, crashed_root);
    assert_eq!(only.title, "Robot arm");
    assert_eq!(only.file_name.as_deref(), Some("robot.stvd"));
    // The sweep keeps recoverable work far longer than plain leftovers.
    assert_eq!(clean_stale(&base, current.root(), MS, LONG), 0);
    assert!(crashed_root.is_dir());
    drop(held);
    let _ = fs::remove_dir_all(base);
}
