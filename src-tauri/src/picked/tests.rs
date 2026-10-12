use super::*;

fn temp_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("studiovd-picked-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(dir.join("sub")).expect("temp dir");
    dir
}

#[test]
fn tokens_are_opaque_and_keep_read_and_write_apart() {
    let dir = temp_dir("tokens");
    let model = dir.join("part.STL");
    fs::write(&model, b"solid").expect("model");
    let mut picked = PickedFiles::default();
    let source = picked.add_source(model.clone()).expect("source");
    assert_eq!((source.name.as_str(), source.size), ("part.STL", 5));
    assert!(!source.token.contains("part"));
    assert_eq!(picked.source(&source.token).expect("known"), model);
    assert_eq!(
        picked.target(&source.token).unwrap_err().kind(),
        "invalidInput"
    );
    let target = picked.add_target(dir.join("out.glb"));
    assert_eq!(
        picked.source(&target.token).unwrap_err().kind(),
        "invalidInput"
    );
    assert_eq!(picked.source("f999").unwrap_err().kind(), "invalidInput");
    assert!(
        picked.add_source(dir.join("sub")).is_err(),
        "directories are refused"
    );
    assert!(has_import_extension(&model));
    assert!(!has_import_extension(&dir.join("notes.txt")));
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn siblings_resolve_only_inside_the_model_directory() {
    let dir = temp_dir("siblings");
    let model = dir.join("scene.gltf");
    fs::write(&model, b"{}").expect("model");
    fs::write(dir.join("scene.bin"), b"bin").expect("bin");
    fs::write(dir.join("sub").join("more.bin"), b"bin").expect("nested bin");
    fs::write(std::env::temp_dir().join("studiovd-outside.bin"), b"x").expect("outside");

    assert!(resolve_sibling(&model, "scene.bin").is_ok());
    assert!(resolve_sibling(&model, "./sub/more.bin").is_ok());
    for bad in [
        "",
        "../studiovd-outside.bin",
        "sub/../../studiovd-outside.bin",
        "/etc/passwd",
        "missing.bin",
        "sub",
        "a\0b",
    ] {
        assert_eq!(
            resolve_sibling(&model, bad).unwrap_err().kind(),
            "invalidInput",
            "{bad}"
        );
    }
    let _ = fs::remove_dir_all(dir);
}

#[cfg(unix)]
#[test]
fn symlinks_cannot_escape_the_model_directory() {
    let dir = temp_dir("symlink");
    let model = dir.join("scene.gltf");
    fs::write(&model, b"{}").expect("model");
    let outside = std::env::temp_dir().join("studiovd-secret.bin");
    fs::write(&outside, b"secret").expect("outside");
    std::os::unix::fs::symlink(&outside, dir.join("link.bin")).expect("symlink");
    assert_eq!(
        resolve_sibling(&model, "link.bin").unwrap_err().kind(),
        "invalidInput"
    );
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn reads_are_capped() {
    let dir = temp_dir("capped");
    let file = dir.join("big.stl");
    fs::write(&file, vec![7u8; 100]).expect("file");
    assert_eq!(read_capped(&file, 100).expect("at the limit").len(), 100);
    assert_eq!(read_capped(&file, 99).unwrap_err().kind(), "invalidInput");
    let _ = fs::remove_dir_all(dir);
}

#[test]
fn drops_register_importable_files_and_name_the_rest() {
    let dir = temp_dir("drop");
    let model = dir.join("bracket.STL");
    fs::write(&model, b"solid").expect("model");
    fs::write(dir.join("notes.txt"), b"x").expect("notes");
    let mut picked = PickedFiles::default();
    let dropped = picked.add_dropped(&[
        model.clone(),
        dir.join("notes.txt"),
        dir.join("sub"),
        dir.join("gone.step"),
    ]);
    assert_eq!(dropped.files.len(), 1);
    assert_eq!(dropped.files[0].name, "bracket.STL");
    assert_eq!(
        picked.source(&dropped.files[0].token).expect("token"),
        model
    );
    assert_eq!(dropped.skipped, ["notes.txt", "sub", "gone.step"]);
    let _ = fs::remove_dir_all(dir);
}
