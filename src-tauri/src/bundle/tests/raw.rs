//! Hostile archives built byte by byte, so each test controls exactly the field it breaks.

use crate::bundle::guard::{extract_zip, Limits};
use std::fs;
use std::io::{Cursor, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};

pub const LIMITS: Limits = Limits {
    max_archive_bytes: 1 << 20,
    max_entries: 16,
    max_total_bytes: 4 << 20,
    max_ratio: 100,
    ratio_floor_bytes: 4096,
    max_name_len: 64,
};

pub fn any_name(_: &str) -> Option<u64> {
    Some(4 << 20)
}

/// A fresh folder per call: tests run in parallel within one process.
pub fn temp(name: &str) -> PathBuf {
    static NEXT: AtomicU64 = AtomicU64::new(0);
    let n = NEXT.fetch_add(1, Ordering::Relaxed);
    let dir = std::env::temp_dir().join(format!("studiovd-zip-{name}-{}-{n}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).expect("temp dir");
    dir
}

#[derive(Clone)]
pub struct RawEntry {
    pub name: Vec<u8>,
    pub data: Vec<u8>,
    /// What the headers claim; defaults to the real stored length.
    pub claimed_size: Option<u32>,
    pub deflate: bool,
    pub external_attributes: u32,
    pub flags: u16,
}

pub fn entry(name: &str, data: &[u8]) -> RawEntry {
    RawEntry {
        name: name.as_bytes().to_vec(),
        data: data.to_vec(),
        claimed_size: None,
        deflate: false,
        external_attributes: 0o100_644 << 16,
        flags: 0,
    }
}

/// A minimal zip writer that does whatever it is told.
pub fn raw_zip(entries: &[RawEntry]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut central = Vec::new();
    for e in entries {
        let (method, payload) = if e.deflate {
            let mut enc =
                flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::best());
            enc.write_all(&e.data).expect("deflate");
            (8u16, enc.finish().expect("deflate"))
        } else {
            (0u16, e.data.clone())
        };
        let crc = crc32(&e.data);
        let size = e.claimed_size.unwrap_or(e.data.len() as u32);
        let offset = out.len() as u32;
        let common = |buf: &mut Vec<u8>| {
            for v in [20u16, e.flags, method, 0, 0x21] {
                buf.extend(v.to_le_bytes());
            }
            for v in [crc, payload.len() as u32, size] {
                buf.extend(v.to_le_bytes());
            }
            buf.extend((e.name.len() as u16).to_le_bytes());
            buf.extend(0u16.to_le_bytes()); // extra length
        };
        out.extend(0x0403_4b50u32.to_le_bytes());
        common(&mut out);
        out.extend(&e.name);
        out.extend(&payload);
        central.extend(0x0201_4b50u32.to_le_bytes());
        central.extend((3u16 << 8 | 20).to_le_bytes()); // made by Unix
        common(&mut central);
        for v in [0u16, 0, 0] {
            central.extend(v.to_le_bytes()); // comment, disk, internal attributes
        }
        central.extend(e.external_attributes.to_le_bytes());
        central.extend(offset.to_le_bytes());
        central.extend(&e.name);
    }
    let cd_offset = out.len() as u32;
    out.extend(&central);
    out.extend(0x0605_4b50u32.to_le_bytes());
    for v in [0u16, 0, entries.len() as u16, entries.len() as u16] {
        out.extend(v.to_le_bytes());
    }
    out.extend((central.len() as u32).to_le_bytes());
    out.extend(cd_offset.to_le_bytes());
    out.extend(0u16.to_le_bytes());
    out
}

fn crc32(data: &[u8]) -> u32 {
    let mut h = flate2::Crc::new();
    h.update(data);
    h.sum()
}

/// Extracts into a fresh folder; returns the error text, or None if it was accepted.
pub fn refusal(zip: Vec<u8>) -> Option<String> {
    let base = temp("case");
    let dest = base.join("out");
    let result = extract_zip(Cursor::new(zip), &dest, &LIMITS, any_name);
    let refused = result.err().map(|e| e.to_string());
    if refused.is_some() {
        assert!(!dest.exists(), "a refused archive leaves nothing behind");
    }
    let _ = fs::remove_dir_all(base);
    refused
}
