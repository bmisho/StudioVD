//! Signature and cache guards (PLAN 14.9): a bad or foreign signature, a mix-and-match of
//! index and signature, a comment for another sequence, rollback, two indexes with one
//! sequence, an expired index, one for a newer app, a cache tampered with on disk.

use super::sign::{comment, TestKey};
use super::{source, temp_dir, Fixture, FAR, NOW};
use crate::library::online::cache::{accept, load};
use crate::library::online::signed::verify_index;
use crate::library::Library;

#[test]
fn signatures_bind_the_index_and_its_comment() {
    let (key, other) = (TestKey::new(1), TestKey::new(2));
    let f = Fixture::new();
    let keys = [key.public()];
    let keys: Vec<&str> = keys.iter().map(String::as_str).collect();
    let (index, sig) = f.signed(&key, 5, FAR);
    assert_eq!(
        verify_index(&index, &sig, &keys).expect("valid").sequence,
        5
    );

    let mut tampered = index.clone();
    tampered[10] ^= 1;
    assert!(verify_index(&tampered, &sig, &keys).is_err());
    let (_, foreign) = f.signed(&other, 5, FAR);
    assert!(
        verify_index(&index, &foreign, &keys).is_err(),
        "not a trusted key"
    );
    let (newer, newer_sig) = f.signed(&key, 6, FAR);
    assert!(
        verify_index(&index, &newer_sig, &keys).is_err(),
        "mix and match"
    );
    assert!(verify_index(&newer, &sig, &keys).is_err(), "mix and match");
    let lying = key.sign(&index, &comment("official", 6));
    assert!(
        verify_index(&index, lying.as_bytes(), &keys).is_err(),
        "other sequence"
    );
    let other_catalog = key.sign(&index, &comment("acme", 5));
    assert!(verify_index(&index, other_catalog.as_bytes(), &keys).is_err());
    let plain = key.sign(&index, "timestamp:1\tfile:index.json\thashed");
    assert!(
        verify_index(&index, plain.as_bytes(), &keys).is_err(),
        "no binding comment"
    );
    // Signed by a trusted key, but naming another key id.
    let wrong_id = f.index(&other, 5, FAR);
    let wrong_sig = key.sign(&wrong_id, &comment("official", 5));
    assert!(verify_index(&wrong_id, wrong_sig.as_bytes(), &keys).is_err());
    assert!(verify_index(&index, b"not a signature", &keys).is_err());
    assert!(verify_index(&vec![b' '; 17 * 1024 * 1024], &sig, &keys).is_err());
}

#[test]
fn rollback_freeze_and_app_version_guards() {
    let key = TestKey::new(3);
    let f = Fixture::new();
    let src = source(&[&key], "https://unused.invalid/", &[]);
    let dir = temp_dir("guards");
    let lib = Library::open(&dir.join("library")).expect("library");
    let (i5, s5) = f.signed(&key, 5, FAR);
    assert!(accept(&lib, src, &i5, &s5, NOW, "0.1.0").expect("first").1);
    assert!(!accept(&lib, src, &i5, &s5, NOW, "0.1.0").expect("same").1);

    let (i4, s4) = f.signed(&key, 4, FAR);
    let rollback = accept(&lib, src, &i4, &s4, NOW, "0.1.0")
        .map(|_| ())
        .unwrap_err();
    assert!(rollback.to_string().contains("older"), "{rollback}");

    let mut other = f.index(&key, 5, FAR);
    other.extend_from_slice(b" ");
    let other_sig = key.sign(&other, &comment("official", 5));
    assert!(accept(&lib, src, &other, other_sig.as_bytes(), NOW, "0.1.0").is_err());

    let (expired, expired_sig) = f.signed(&key, 7, "2026-01-02T00:00:00Z");
    let frozen = accept(&lib, src, &expired, &expired_sig, NOW, "0.1.0").map(|_| ());
    assert!(frozen.unwrap_err().to_string().contains("expired"));

    let (i6, s6) = f.signed(&key, 6, FAR);
    assert!(
        accept(&lib, src, &i6, &s6, NOW, "0.0.9").is_err(),
        "needs a newer app"
    );
    accept(&lib, src, &i6, &s6, NOW, "0.1.0").expect("newer");
    assert_eq!(load(&lib, src).expect("cached").meta.sequence, 6);

    // Deleting the cached index keeps the guard: #5 stays refused.
    std::fs::remove_file(dir.join("library/catalogs/official/index.json")).expect("rm");
    assert!(load(&lib, src).is_none());
    assert!(accept(&lib, src, &i5, &s5, NOW, "0.1.0").is_err());

    // A cache edited on disk no longer verifies.
    accept(&lib, src, &i6, &s6, NOW, "0.1.0").expect("again");
    let path = dir.join("library/catalogs/official/index.json");
    let mut bytes = std::fs::read(&path).expect("read");
    bytes[20] ^= 1;
    std::fs::write(&path, bytes).expect("write");
    assert!(load(&lib, src).is_none());
}
