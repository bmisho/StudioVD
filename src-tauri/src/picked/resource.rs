//! Serving the files a .gltf/.obj names next to itself, through the model's read token.

use super::{read_capped, refs, resolve_sibling, Access, PickedFiles, MAX_IMPORT_BYTES};
use crate::error::{AppError, AppResult};
use std::sync::MutexGuard;

/// Reads `relative` for the model behind `token`: only a name the model itself refers to,
/// resolved inside its folder, and at most MAX_IMPORT_BYTES of siblings per model (a
/// crafted .gltf can list the same buffer as `a.bin`, `./a.bin`, `././a.bin`, …).
/// `lock` gives the shared file list; it is not held while reading the disk.
pub fn read_resource<'a>(
    lock: impl Fn() -> AppResult<MutexGuard<'a, PickedFiles>>,
    token: &str,
    relative: &str,
) -> AppResult<Vec<u8>> {
    let (model, cached) = {
        let mut picked = lock()?;
        let entry = picked.entry(token, Access::Read)?;
        (entry.path.clone(), entry.refs.clone())
    };
    let names = match cached {
        Some(names) => names,
        None => {
            let names = refs::model_references(&model)?;
            lock()?.entry(token, Access::Read)?.refs = Some(names.clone());
            names
        }
    };
    if !names.iter().any(|n| n == relative) {
        return Err(AppError::InvalidInput(format!(
            "'{relative}' is not a file this model refers to."
        )));
    }
    let path = resolve_sibling(&model, relative)?;
    let used = lock()?.entry(token, Access::Read)?.resource_bytes;
    let bytes = read_capped(&path, MAX_IMPORT_BYTES.saturating_sub(used))?;
    lock()?.entry(token, Access::Read)?.resource_bytes += bytes.len() as u64;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::super::refs::{decode_uri, model_references};
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::sync::Mutex;

    fn dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("studiovd-res-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).expect("dir");
        d
    }

    #[test]
    fn decodes_uris_like_the_frontend() {
        assert_eq!(decode_uri("scene%20data.bin"), "scene data.bin");
        assert_eq!(decode_uri("bad%E0.bin"), "bad%E0.bin"); // invalid UTF-8: as written
        assert_eq!(decode_uri("half%2"), "half%2");
    }

    #[test]
    fn models_name_their_own_siblings() {
        let d = dir("refs");
        let gltf = d.join("s.gltf");
        let json = r#"{"buffers":[{"uri":"a%20b.bin"},{"uri":"data:,x"},{"byteLength":1},{"uri":"a%20b.bin"}]}"#;
        fs::write(&gltf, json).expect("gltf");
        assert_eq!(model_references(&gltf).expect("refs"), ["a b.bin"]);
        let obj = d.join("m.obj");
        fs::write(
            &obj,
            "# mtllib no.mtl\r\nmtllib my parts.mtl\r\nmtllibx x\rmtllib\tb.mtl\n",
        )
        .expect("obj");
        assert_eq!(
            model_references(&obj).expect("refs"),
            ["my parts.mtl", "b.mtl"]
        );
        assert!(model_references(&d.join("x.stl")).expect("none").is_empty());
        let _ = fs::remove_dir_all(d);
    }

    #[test]
    fn a_token_reads_only_what_its_model_names_within_a_budget() {
        let d = dir("grant");
        fs::write(
            d.join("s.gltf"),
            r#"{"buffers":[{"uri":"s.bin"},{"uri":"./s.bin"}]}"#,
        )
        .expect("gltf");
        fs::write(d.join("s.bin"), b"buffer").expect("bin");
        fs::write(d.join("secret.txt"), b"secret").expect("secret");
        fs::write(d.join("part.stl"), b"solid").expect("stl");
        let files = Mutex::new(PickedFiles::default());
        let (gltf, stl) = {
            let mut p = files.lock().expect("lock");
            (
                p.add_source(d.join("s.gltf")).expect("gltf").token,
                p.add_source(d.join("part.stl")).expect("stl").token,
            )
        };
        let lock = || files.lock().map_err(|_| AppError::Io("poisoned".into()));
        assert_eq!(
            read_resource(lock, &gltf, "s.bin").expect("named"),
            b"buffer"
        );
        assert_eq!(
            read_resource(lock, &gltf, "./s.bin").expect("named"),
            b"buffer"
        );
        for (token, name) in [(&gltf, "secret.txt"), (&gltf, "s.gltf"), (&stl, "s.bin")] {
            assert_eq!(
                read_resource(lock, token, name).unwrap_err().kind(),
                "invalidInput",
                "{name}"
            );
        }
        // The per-model budget counts every sibling byte served.
        files
            .lock()
            .expect("lock")
            .entry(&gltf, Access::Read)
            .expect("entry")
            .resource_bytes = MAX_IMPORT_BYTES - 2;
        assert_eq!(
            read_resource(lock, &gltf, "s.bin").unwrap_err().kind(),
            "invalidInput"
        );
        let _ = fs::remove_dir_all(d);
    }
}
