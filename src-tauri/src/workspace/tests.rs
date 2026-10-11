use super::*;

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
    assert!(ws.write_asset(&id, bytes).expect("first write"));
    assert!(!ws.write_asset(&id, bytes).expect("second write is a no-op"));
    let stored = fs::read(ws.geometry_dir().join(format!("{id}.glb"))).expect("stored");
    assert_eq!(stored, bytes);
    let _ = fs::remove_dir_all(base);
}

#[test]
fn rejects_bad_ids_and_mismatched_content() {
    let base = temp_base("reject");
    let ws = Workspace::create(&base).expect("workspace");
    assert_eq!(
        ws.write_asset("../../etc/passwd", b"x").unwrap_err().kind(),
        "invalidInput"
    );
    assert_eq!(
        ws.write_asset(&"A".repeat(64), b"x").unwrap_err().kind(),
        "invalidInput"
    );
    let other = sha256_hex(b"something else");
    assert_eq!(
        ws.write_asset(&other, b"x").unwrap_err().kind(),
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
    let removed = clean_stale(&base, Duration::from_millis(1), keep.root());
    assert_eq!(removed, 1);
    assert!(keep.root().is_dir());
    assert!(base.join("unrelated").is_dir());
    let _ = fs::remove_dir_all(base);
}
