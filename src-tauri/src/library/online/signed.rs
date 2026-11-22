//! Verifying a catalog index before anything parses it (PLAN 4.4, 14.3): size caps, the
//! minisign signature by a compiled-in key (prehashed only), then the trusted comment, which
//! binds the catalog id, sequence and schema, against the index's own fields.
//!
//! Trusted comment: `studiovd-catalog catalog=<id> sequence=<n> schema=<v>` (sign with
//! `minisign -S -m index.json -t "studiovd-catalog catalog=official sequence=42 schema=1"`).

use super::meta::IndexMeta;
use crate::error::{AppError, AppResult};
use minisign_verify::{PublicKey, Signature};

pub const MAX_INDEX_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_SIGNATURE_BYTES: usize = 4096;

fn refused<T>(reason: &str) -> AppResult<T> {
    Err(AppError::InvalidInput(format!(
        "The catalog index was refused: {reason}."
    )))
}

/// The key id minisign prints (`%016X` of the little-endian key number).
pub fn key_id(public_key_b64: &str) -> Option<String> {
    let bytes = decode_b64(public_key_b64.trim())?;
    let num: [u8; 8] = bytes.get(2..10)?.try_into().ok()?;
    (bytes.len() == 42).then(|| format!("{:016X}", u64::from_le_bytes(num)))
}

fn decode_b64(s: &str) -> Option<Vec<u8>> {
    let value = |c: u8| -> Option<u32> {
        Some(match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            _ => return None,
        } as u32)
    };
    let s = s.trim_end_matches('=').as_bytes();
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    for chunk in s.chunks(4) {
        let mut acc = 0u32;
        for (i, &c) in chunk.iter().enumerate() {
            acc |= value(c)? << (18 - 6 * i);
        }
        let n = chunk.len().checked_sub(1)?;
        out.extend_from_slice(&acc.to_be_bytes()[1..1 + n]);
    }
    Some(out)
}

/// `key=value` pairs of a trusted comment after its `studiovd-catalog` tag.
fn comment_field<'a>(comment: &'a str, name: &str) -> Option<&'a str> {
    let mut words = comment.split_whitespace();
    if words.next()? != "studiovd-catalog" {
        return None;
    }
    words.find_map(|w| w.strip_prefix(name)?.strip_prefix('='))
}

/// The index, verified by one of `keys`; Err says why it was refused.
pub fn verify_index(index: &[u8], signature: &[u8], keys: &[&str]) -> AppResult<IndexMeta> {
    if index.len() > MAX_INDEX_BYTES {
        return refused("it is larger than 16 MiB");
    }
    if signature.len() > MAX_SIGNATURE_BYTES {
        return refused("its signature file is too large");
    }
    let Ok(text) = std::str::from_utf8(signature) else {
        return refused("its signature is not text");
    };
    let Ok(sig) = Signature::decode(text) else {
        return refused("its signature is not a minisign signature");
    };
    let signer = keys.iter().find(|k| {
        PublicKey::from_base64(k.trim()).is_ok_and(|pk| pk.verify(index, &sig, false).is_ok())
    });
    let Some(signer) = signer else {
        return refused("no trusted key signed it");
    };
    let comment = sig.trusted_comment();
    let meta = IndexMeta::parse(index)?;
    let field = |name| comment_field(comment, name);
    if field("catalog") != Some(meta.catalog_id.as_str()) {
        return refused("its signature is for another catalog");
    }
    if field("sequence") != Some(meta.sequence.to_string().as_str()) {
        return refused("its signature is for another sequence");
    }
    if field("schema") != Some(meta.schema_version.to_string().as_str()) {
        return refused("its signature is for another schema");
    }
    if meta.format != "studiovd-catalog" {
        return refused("it is not a StudioVD catalog");
    }
    if key_id(signer).as_deref() != Some(meta.signing_key_id.as_str()) {
        return refused("it names another signing key");
    }
    Ok(meta)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_minisign_key_ids() {
        // minisign's README key: `RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3`
        // is printed as key id E7620F1842B4E81F.
        let id = key_id("RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3");
        assert_eq!(id.as_deref(), Some("E7620F1842B4E81F"));
        assert_eq!(key_id("short"), None);
    }

    #[test]
    fn trusted_comment_fields() {
        let c = "studiovd-catalog catalog=official sequence=42 schema=1";
        assert_eq!(comment_field(c, "sequence"), Some("42"));
        assert_eq!(comment_field(c, "seq"), None);
        assert_eq!(comment_field("timestamp:1 file:x", "catalog"), None);
    }
}
