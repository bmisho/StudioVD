//! A pack's GLB files, checked before they are stored (CLAUDE.md §9: no buffers or images
//! with external or `data:` URIs). The container must be exactly what the import pipeline
//! writes: glTF 2.0 binary, a JSON chunk then at most one BIN chunk, sizes that add up. The
//! webview reads geometry strictly on top of this (GLB v1/v2 with material slots).

use crate::error::{AppError, AppResult};
use serde_json::Value;

const MAGIC: u32 = 0x4654_6C67; // "glTF"
const JSON_CHUNK: u32 = 0x4E4F_534A;
const BIN_CHUNK: u32 = 0x004E_4942;
/// The JSON chunk is small for our geometry; a large one is an attempt to slow the parser.
const MAX_JSON_BYTES: usize = 4 * 1024 * 1024;

fn bad<T>(reason: &str) -> AppResult<T> {
    Err(AppError::InvalidInput(format!(
        "A geometry file is not valid: {reason}."
    )))
}

fn u32_at(bytes: &[u8], at: usize) -> Option<u32> {
    let b = bytes.get(at..at + 4)?;
    Some(u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
}

/// True when any `uri` in the JSON names something: only the GLB's own BIN chunk may hold
/// buffer data, and images come from buffer views.
fn names_a_uri(json: &Value) -> bool {
    let has_uri = |key: &str| {
        json.get(key)
            .and_then(Value::as_array)
            .is_some_and(|items| items.iter().any(|item| item.get("uri").is_some()))
    };
    has_uri("buffers") || has_uri("images")
}

pub fn check_glb(bytes: &[u8]) -> AppResult<()> {
    if u32_at(bytes, 0) != Some(MAGIC) || u32_at(bytes, 4) != Some(2) {
        return bad("not glTF 2.0 binary");
    }
    if u32_at(bytes, 8).map(|n| n as usize) != Some(bytes.len()) {
        return bad("its length is not its size");
    }
    let Some(json_len) = u32_at(bytes, 12).map(|n| n as usize) else {
        return bad("no JSON chunk");
    };
    if u32_at(bytes, 16) != Some(JSON_CHUNK)
        || json_len > MAX_JSON_BYTES
        || !json_len.is_multiple_of(4)
    {
        return bad("the JSON chunk is missing, misaligned or too large");
    }
    let Some(json_bytes) = bytes.get(20..20 + json_len) else {
        return bad("the JSON chunk is truncated");
    };
    let mut at = 20 + json_len;
    if at < bytes.len() {
        let bin_len = u32_at(bytes, at).map(|n| n as usize);
        let fits = bin_len.is_some_and(|n| n.is_multiple_of(4) && at + 8 + n == bytes.len());
        if u32_at(bytes, at + 4) != Some(BIN_CHUNK) || !fits {
            return bad("a chunk after JSON is not the one BIN chunk");
        }
        at = bytes.len();
    }
    if at != bytes.len() {
        return bad("it has trailing bytes");
    }
    let json: Value = serde_json::from_slice(json_bytes).or_else(|_| bad("its JSON is broken"))?;
    if !json.is_object() || names_a_uri(&json) {
        return bad("it refers to external or embedded data");
    }
    if json.get("extensionsRequired").is_some() {
        return bad("it requires glTF extensions");
    }
    Ok(())
}
