//! The `stvd` URI scheme: the only way the webview reads workspace files. It answers
//! `stvd://localhost/<sha256>.glb|png|jpg` (`http://stvd.localhost/…` on Windows) from the
//! current workspace's `geometry/` and `textures/` folders and nothing else. Tauri's own asset
//! protocol is not used: Tauri widens that scope by itself for every file or folder dropped on
//! the window.

use super::texture::MAX_TEXTURE_BYTES;
use super::{is_asset_id, MAX_ASSET_BYTES};
use crate::picked::read_capped;
use std::path::Path;
use tauri::http::{header, Response, StatusCode};

pub const ASSET_SCHEME: &str = "stvd";

/// Folder, size cap and content type for each kind of file the scheme serves.
fn kind(ext: &str) -> Option<(&'static str, u64, &'static str)> {
    match ext {
        "glb" => Some(("geometry", MAX_ASSET_BYTES as u64, "model/gltf-binary")),
        "png" => Some(("textures", MAX_TEXTURE_BYTES, "image/png")),
        "jpg" => Some(("textures", MAX_TEXTURE_BYTES, "image/jpeg")),
        _ => None,
    }
}

/// Status, content type and body for a request path such as `/<64 hex>.glb`.
pub fn asset_reply(
    bundle_dir: Option<&Path>,
    uri_path: &str,
) -> (StatusCode, &'static str, Vec<u8>) {
    let name = uri_path.strip_prefix('/').unwrap_or(uri_path);
    let parsed = name
        .split_once('.')
        .filter(|(id, _)| is_asset_id(id))
        .and_then(|(id, ext)| kind(ext).map(|k| (id, ext, k)));
    let Some((id, ext, (folder, cap, mime))) = parsed else {
        return (StatusCode::BAD_REQUEST, "text/plain", Vec::new());
    };
    let Some(dir) = bundle_dir else {
        return (StatusCode::SERVICE_UNAVAILABLE, mime, Vec::new());
    };
    let path = dir.join(folder).join(format!("{id}.{ext}"));
    if !path.is_file() {
        return (StatusCode::NOT_FOUND, mime, Vec::new());
    }
    match read_capped(&path, cap) {
        Ok(bytes) => (StatusCode::OK, mime, bytes),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, mime, Vec::new()),
    }
}

/// The HTTP response. Assets are not secret (the webview wrote them), so any origin may read
/// them: the dev server (`http://localhost:1420`) and the bundled app have different origins.
pub fn asset_response(status: StatusCode, mime: &str, body: Vec<u8>) -> Response<Vec<u8>> {
    let built = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, mime)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::CACHE_CONTROL, "no-store")
        .body(body);
    built.unwrap_or_else(|_| {
        let mut fallback = Response::new(Vec::new());
        *fallback.status_mut() = StatusCode::INTERNAL_SERVER_ERROR;
        fallback
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serves_only_content_addresses_from_geometry_and_textures() {
        let dir = std::env::temp_dir().join(format!("studiovd-proto-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("geometry")).expect("dir");
        std::fs::create_dir_all(dir.join("textures")).expect("dir");
        let id = "a".repeat(64);
        std::fs::write(dir.join("geometry").join(format!("{id}.glb")), b"glb").expect("asset");
        std::fs::write(dir.join("textures").join(format!("{id}.jpg")), b"jpg").expect("image");
        std::fs::write(dir.join("notes.txt"), b"x").expect("other");

        let ok = asset_reply(Some(&dir), &format!("/{id}.glb"));
        assert_eq!(ok, (StatusCode::OK, "model/gltf-binary", b"glb".to_vec()));
        let image = asset_reply(Some(&dir), &format!("/{id}.jpg"));
        assert_eq!(image, (StatusCode::OK, "image/jpeg", b"jpg".to_vec()));
        for bad in [
            "/notes.txt",
            "/../notes.txt",
            "/..%2Fnotes.txt",
            &format!("/{}.glb", "A".repeat(64)),
            &format!("/sub/{id}.glb"),
            &format!("/{id}.jpeg"),
            &format!("/{id}.glb.png"),
            "/",
        ] {
            assert_eq!(
                asset_reply(Some(&dir), bad).0,
                StatusCode::BAD_REQUEST,
                "{bad}"
            );
        }
        let missing = format!("/{}.glb", "b".repeat(64));
        assert_eq!(asset_reply(Some(&dir), &missing).0, StatusCode::NOT_FOUND);
        let wrong_folder = format!("/{id}.png"); // only the .jpg exists
        assert_eq!(
            asset_reply(Some(&dir), &wrong_folder).0,
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            asset_reply(None, &format!("/{id}.glb")).0,
            StatusCode::SERVICE_UNAVAILABLE
        );
        let response = asset_response(StatusCode::OK, "image/png", Vec::new());
        assert_eq!(response.headers()["access-control-allow-origin"], "*");
        let _ = std::fs::remove_dir_all(dir);
    }
}
