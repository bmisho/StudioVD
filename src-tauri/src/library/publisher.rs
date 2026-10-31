//! The user's publisher namespace (PLAN 9.7): `u-` and six base32 characters, made once per
//! installation and kept in `library/publisher.json`, so two people's `bracket` components
//! never clash when they swap packs. Components in it are listed as the user's own.

use super::Library;
use crate::error::{AppError, AppResult};
use crate::fsutil::write_atomic;
use crate::workspace::hex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;

const FORMAT: &str = "studiovd-publisher-1";
const BASE32: &[u8; 32] = b"abcdefghijklmnopqrstuvwxyz234567";

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Publisher {
    format: String,
    namespace: String,
}

/// `u-` and six base32 characters: a valid namespace that no reserved one starts like.
pub fn is_user_namespace(ns: &str) -> bool {
    ns.len() == 8 && ns.starts_with("u-") && ns.bytes().skip(2).all(|b| BASE32.contains(&b))
}

fn fresh(seed: &str) -> String {
    let digest = Sha256::digest(seed.as_bytes());
    let tail: String = digest
        .iter()
        .take(6)
        .map(|b| BASE32[usize::from(b & 31)] as char)
        .collect();
    format!("u-{tail}")
}

fn read(lib: &Library) -> Option<String> {
    let bytes = fs::read(lib.publisher_path()).ok()?;
    let p: Publisher = serde_json::from_slice(&bytes).ok()?;
    (p.format == FORMAT && is_user_namespace(&p.namespace)).then_some(p.namespace)
}

/// This installation's namespace, made (under the write lock) the first time it is asked for.
/// Not a secret: the seed only has to differ between machines.
pub fn namespace(lib: &Library) -> AppResult<String> {
    if let Some(ns) = read(lib) {
        return Ok(ns);
    }
    let lock = lib.lock()?;
    if let Some(ns) = read(lib) {
        return Ok(ns);
    }
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let root = hex(&Sha256::digest(lib.root().to_string_lossy().as_bytes()));
    let ns = fresh(&format!("{nanos}:{}:{root}", std::process::id()));
    let json = serde_json::to_vec_pretty(&Publisher {
        format: FORMAT.into(),
        namespace: ns.clone(),
    })
    .map_err(|e| AppError::Io(e.to_string()))?;
    write_atomic(&lib.publisher_path(), &json)?;
    drop(lock);
    Ok(ns)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bundle::tests::raw::temp;

    #[test]
    fn makes_one_namespace_and_keeps_it() {
        let dir = temp("publisher");
        let lib = Library::open(&dir).expect("library");
        let ns = namespace(&lib).expect("namespace");
        assert!(is_user_namespace(&ns), "{ns}");
        assert!(crate::library::packfile::check_component_id(&format!(
            "{ns}/bracket"
        )));
        assert_eq!(namespace(&lib).expect("again"), ns);
        let reopened = Library::open(&dir).expect("reopen");
        assert_eq!(namespace(&reopened).expect("reopened"), ns);
    }

    #[test]
    fn replaces_a_damaged_file() {
        let dir = temp("publisher-bad");
        let lib = Library::open(&dir).expect("library");
        fs::write(
            lib.publisher_path(),
            br#"{"format":"x","namespace":"official"}"#,
        )
        .expect("w");
        let ns = namespace(&lib).expect("namespace");
        assert!(is_user_namespace(&ns));
        assert!(!is_user_namespace("official"));
        assert!(!is_user_namespace("u-ABCDEF"));
        assert!(!is_user_namespace("u-abc1ef")); // 1 is not base32
    }
}
