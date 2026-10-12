//! The files a model names next to itself. A .gltf lists its external buffers
//! (`buffers[].uri`), an .obj its material libraries (`mtllib`). These are the ONLY names
//! `read_import_resource` serves for that model's token, so a token is not a key to the
//! whole folder (the same rules as `src/core/import/externalRefs.ts`).

use super::{file_name, read_capped};
use crate::error::{AppError, AppResult};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;

/// glTF JSON is parsed whole; larger files should be .glb (the webview has the same cap).
pub const MAX_GLTF_JSON_BYTES: u64 = 256 * 1024 * 1024;

/// Percent-decodes a URI like `decodeURIComponent`; a malformed escape or invalid UTF-8
/// leaves it as written (the frontend does the same).
pub fn decode_uri(uri: &str) -> String {
    let bytes = uri.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = bytes
                .get(i + 1..i + 3)
                .and_then(|h| std::str::from_utf8(h).ok());
            match hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
                Some(b) => out.push(b),
                None => return uri.to_owned(),
            }
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).unwrap_or_else(|_| uri.to_owned())
}

fn gltf_buffers(path: &Path) -> AppResult<Vec<String>> {
    let bytes = read_capped(path, MAX_GLTF_JSON_BYTES)?;
    let json: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| {
        AppError::InvalidInput(format!("{} is not valid glTF JSON: {e}", file_name(path)))
    })?;
    let mut names: Vec<String> = Vec::new();
    for buffer in json["buffers"].as_array().into_iter().flatten() {
        let Some(uri) = buffer["uri"].as_str() else {
            continue;
        };
        if uri.is_empty() || uri.starts_with("data:") {
            continue;
        }
        let name = decode_uri(uri);
        if !names.contains(&name) {
            names.push(name);
        }
    }
    Ok(names)
}

/// `mtllib` at the start of a line, then whitespace; the rest of the line is ONE file name
/// (as three's OBJLoader reads it). Streams the file: an OBJ can be hundreds of MB.
fn obj_libraries(path: &Path) -> AppResult<Vec<String>> {
    let mut reader = BufReader::new(fs::File::open(path)?);
    let mut names: Vec<String> = Vec::new();
    let mut chunk = Vec::new();
    loop {
        chunk.clear();
        if reader.read_until(b'\n', &mut chunk)? == 0 {
            break;
        }
        for line in chunk.split(|&b| b == b'\n' || b == b'\r') {
            let Some(rest) = line.strip_prefix(b"mtllib") else {
                continue;
            };
            if !matches!(rest.first(), Some(b' ' | b'\t')) {
                continue;
            }
            let name = String::from_utf8_lossy(rest).trim().to_owned();
            if !name.is_empty() && !names.contains(&name) {
                names.push(name);
            }
        }
    }
    Ok(names)
}

/// The sibling names `path` refers to; empty for formats that have none.
pub fn model_references(path: &Path) -> AppResult<Vec<String>> {
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "gltf" => gltf_buffers(path),
        "obj" => obj_libraries(path),
        _ => Ok(Vec::new()),
    }
}
