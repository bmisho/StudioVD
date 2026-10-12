//! The `stvd` URI scheme: the only way the webview reads workspace files. It answers
//! `stvd://localhost/<sha256>.glb` (`http://stvd.localhost/…` on Windows) from the current
//! workspace's `geometry/` folder and nothing else. Tauri's own asset protocol is not used:
//! Tauri widens that scope by itself for every file or folder dropped on the window.

use super::{is_asset_id, MAX_ASSET_BYTES};
use crate::picked::read_capped;
use std::path::Path;
use tauri::http::{header, Response, StatusCode};

pub const ASSET_SCHEME: &str = "stvd";

/// Status and body for a request path such as `/<64 hex>.glb`.
pub fn asset_reply(geometry_dir: Option<&Path>, uri_path: &str) -> (StatusCode, Vec<u8>) {
    let name = uri_path.strip_prefix('/').unwrap_or(uri_path);
    let Some(id) = name.strip_suffix(".glb").filter(|id| is_asset_id(id)) else {
        return (StatusCode::BAD_REQUEST, Vec::new());
    };
    let Some(dir) = geometry_dir else {
        return (StatusCode::SERVICE_UNAVAILABLE, Vec::new());
    };
    let path = dir.join(format!("{id}.glb"));
    if !path.is_file() {
        return (StatusCode::NOT_FOUND, Vec::new());
    }
    match read_capped(&path, MAX_ASSET_BYTES as u64) {
        Ok(bytes) => (StatusCode::OK, bytes),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, Vec::new()),
    }
}

/// The HTTP response. Assets are not secret (the webview wrote them), so any origin may read
/// them: the dev server (`http://localhost:1420`) and the bundled app have different origins.
pub fn asset_response(status: StatusCode, body: Vec<u8>) -> Response<Vec<u8>> {
    let built = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "model/gltf-binary")
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
    fn serves_only_asset_ids_from_the_geometry_folder() {
        let dir = std::env::temp_dir().join(format!("studiovd-proto-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("dir");
        let id = "a".repeat(64);
        std::fs::write(dir.join(format!("{id}.glb")), b"glb").expect("asset");
        std::fs::write(dir.join("notes.txt"), b"x").expect("other");

        let ok = asset_reply(Some(&dir), &format!("/{id}.glb"));
        assert_eq!(ok, (StatusCode::OK, b"glb".to_vec()));
        for bad in [
            "/notes.txt",
            "/../notes.txt",
            "/..%2Fnotes.txt",
            &format!("/{}.glb", "A".repeat(64)),
            &format!("/sub/{id}.glb"),
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
        assert_eq!(
            asset_reply(None, &format!("/{id}.glb")).0,
            StatusCode::SERVICE_UNAVAILABLE
        );
        let response = asset_response(StatusCode::OK, Vec::new());
        assert_eq!(response.headers()["access-control-allow-origin"], "*");
        let _ = std::fs::remove_dir_all(dir);
    }
}
