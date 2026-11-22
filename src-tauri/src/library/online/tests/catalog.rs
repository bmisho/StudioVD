//! Refresh → thumbnails → download → stage → commit over the mock server, with a first pack
//! host that fails; and a pack that is not what the catalog lists.

use super::mock::{serve, Reply};
use super::sign::TestKey;
use super::{client, source, temp_dir, Fixture, FAR, NOW};
use crate::library::commit::commit;
use crate::library::install::stage_pack_as;
use crate::library::installed::Origin;
use crate::library::online::cache;
use crate::library::online::catalog::{fetch_pack, refresh, Ctx};
use crate::library::online::previews::thumbs_dir;
use crate::library::online::trust::Trust;
use crate::library::tests::Pack;
use crate::library::Library;
use tokio_util::sync::CancellationToken;

#[tokio::test]
async fn refresh_download_and_install_as_official() {
    let key = TestKey::new(4);
    let f = Fixture::new();
    let (index, sig) = f.signed(&key, 9, FAR);
    let (pack, preview) = (f.pack.clone(), f.preview.clone());
    let mock = serve(move |req, _| match req.path.as_str() {
        "/latest/index.json" => Reply::ok(&index),
        "/latest/index.json.minisig" => Reply::ok(&sig),
        "/dl/v1/led.stvdpack" => Reply::ok(&pack),
        "/dl/v1/previews.zip" => Reply::ok(&preview),
        _ => Reply::status(404),
    });
    let src = source(
        &[&key],
        &format!("{}latest/", mock.base),
        &[&format!("{}down/", mock.base), &format!("{}dl/", mock.base)],
    );
    let dir = temp_dir("catalog-e2e");
    let lib = Library::open(&dir.join("library")).expect("library");
    let (client, cancel) = (client(), CancellationToken::new());
    let ctx = Ctx {
        lib: &lib,
        source: src,
        client: &client,
        mirror: None,
        cancel: &cancel,
        now: NOW,
        app_version: "0.1.0",
    };
    let done = refresh(&ctx).await.expect("refreshed");
    assert!(done.changed);
    assert_eq!(done.previews_failed, 0);
    assert!(thumbs_dir(&lib)
        .join(format!("{}.png", f.thumb_sha))
        .is_file());

    let meta = cache::load(&lib, src).expect("cached").meta;
    let mut last = (0, 0);
    let path = fetch_pack(&ctx, &meta, &f.pack_sha, &mut |d, t| last = (d, t))
        .await
        .expect("downloaded from the second host");
    assert_eq!(last, (f.pack.len() as u64, f.pack.len() as u64));
    let trust = Trust::Catalog {
        meta: &meta,
        pack: &f.pack_sha,
    };
    let (staged, summary) = stage_pack_as(&lib, &path, &trust).expect("staged");
    assert!(summary.verified);
    let all = commit(&lib, staged, 1).expect("installed");
    assert_eq!(
        (all[0].id.as_str(), all[0].origin),
        ("official/led", Origin::Official)
    );

    // A second refresh with the same index changes nothing and fetches no thumbnails.
    let previews = || {
        mock.hits()
            .iter()
            .filter(|h| h.path.ends_with("previews.zip"))
            .count()
    };
    let before = previews();
    let again = refresh(&ctx).await.expect("again");
    assert!(!again.changed);
    assert_eq!(previews(), before);
}

#[test]
fn a_catalog_vouches_only_for_what_it_lists() {
    let key = TestKey::new(5);
    let f = Fixture::new();
    let meta =
        crate::library::online::meta::IndexMeta::parse(&f.index(&key, 1, FAR)).expect("meta");
    let dir = temp_dir("catalog-trust");
    let lib = Library::open(&dir.join("library")).expect("library");

    // Another pack (same files, another pack.json) is not the one the catalog lists.
    let pack = Pack::new("official/led");
    let other = pack.zip(&[], Some(pack.pack_json().replace("\"test\"", "\"other\"")));
    let path = dir.join("other.stvdpack");
    std::fs::write(&path, other).expect("write");
    let trust = Trust::Catalog {
        meta: &meta,
        pack: &f.pack_sha,
    };
    assert!(stage_pack_as(&lib, &path, &trust).is_err());

    // Without a catalog, the reserved namespace is refused.
    std::fs::write(&path, &f.pack).expect("write");
    assert!(stage_pack_as(&lib, &path, &Trust::Unsigned).is_err());
    // With it, a listed pack whose manifest the index names otherwise is refused too.
    let mut wrong = meta.clone();
    wrong.components[0].manifest_sha256 = "0".repeat(64);
    let lying = Trust::Catalog {
        meta: &wrong,
        pack: &f.pack_sha,
    };
    assert!(stage_pack_as(&lib, &path, &lying).is_err());
    assert!(stage_pack_as(&lib, &path, &trust).is_ok());
}
