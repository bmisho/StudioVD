//! Name and layout rules for untrusted zip archives (see `guard`).

use super::guard::bad;
use crate::error::AppResult;
use std::io::{Read, Seek, SeekFrom};
use zip::ZipArchive;

/// DOS device names, refused as a path component on every OS (Windows would open the device).
fn reserved(component: &str) -> bool {
    let stem = component
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let numbered = |prefix: &str| {
        stem.len() == 4 && stem.starts_with(prefix) && stem.as_bytes()[3].is_ascii_digit()
    };
    matches!(
        stem.as_str(),
        "con" | "prn" | "aux" | "nul" | "conin$" | "conout$"
    ) || numbered("com")
        || numbered("lpt")
}

/// An entry name as raw bytes → a safe relative path, the same on every OS: ASCII letters,
/// digits, `._-` and `/` separators; no empty, dot-leading or dot-trailing components, no
/// device names. Rules out absolute paths, `..`, drive letters, backslashes and streams.
pub fn check_name(raw: &[u8], max_len: usize) -> AppResult<&str> {
    let Ok(name) = std::str::from_utf8(raw) else {
        return bad("an entry name is not UTF-8");
    };
    if name.is_empty() || name.len() > max_len {
        return bad("an entry name is empty or too long");
    }
    let charset = |b: u8| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-' | b'/');
    if !name.bytes().all(charset) {
        return bad(format!("entry {name:?} has a forbidden character"));
    }
    for c in name.split('/') {
        if c.is_empty() || c.starts_with('.') || c.ends_with('.') || reserved(c) {
            return bad(format!("entry {name:?} has a forbidden path component"));
        }
    }
    Ok(name)
}

/// The end-of-central-directory record, which must be the archive's last 22 bytes:
/// no comment, no trailing data, no ZIP64, one disk.
pub(super) struct Eocd {
    pub entries: u16,
    cd_size: u32,
    cd_offset: u32,
    pos: u64,
}

pub(super) fn read_eocd<R: Read + Seek>(r: &mut R, file_len: u64) -> AppResult<Eocd> {
    let Some(pos) = file_len.checked_sub(22) else {
        return bad("the file is too short to be an archive");
    };
    let mut b = [0u8; 22];
    r.seek(SeekFrom::Start(pos))?;
    r.read_exact(&mut b)?;
    let u16_at = |o: usize| u16::from_le_bytes([b[o], b[o + 1]]);
    let u32_at = |o: usize| u32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]]);
    let plain = u32_at(0) == 0x0605_4b50
        && u16_at(4) == 0
        && u16_at(6) == 0
        && u16_at(8) == u16_at(10)
        && u16_at(20) == 0
        && u16_at(10) != 0xFFFF
        && u32_at(12) != 0xFFFF_FFFF
        && u32_at(16) != 0xFFFF_FFFF;
    if !plain {
        return bad("the archive is truncated, has trailing data or uses ZIP64");
    }
    Ok(Eocd {
        entries: u16_at(10),
        cd_size: u32_at(12),
        cd_offset: u32_at(16),
        pos,
    })
}

/// Local entries back to back from byte 0, then the central directory, then the EOCD:
/// no prefixed data, no gaps or hidden entries, no overlaps, no collapsed duplicate names.
pub(super) fn check_layout<R: Read + Seek>(a: &mut ZipArchive<R>, eocd: &Eocd) -> AppResult<()> {
    let cd_start = a.central_directory_start();
    if a.offset() != 0
        || usize::from(eocd.entries) != a.len()
        || u64::from(eocd.cd_offset) != cd_start
        || cd_start + u64::from(eocd.cd_size) != eocd.pos
    {
        return bad("the archive has prefixed data, duplicate names or a bad directory");
    }
    let mut spans = Vec::with_capacity(a.len());
    for i in 0..a.len() {
        let f = a.by_index_raw(i)?; // parses the local header and sets data_start
        if f.flags().is_using_data_descriptor() {
            return bad("the archive uses data descriptors");
        }
        let Some(start) = f.data_start() else {
            return bad("an entry has no data");
        };
        let Some(end) = start.checked_add(f.compressed_size()) else {
            return bad("an entry's size overflows");
        };
        spans.push((f.header_start(), end));
    }
    spans.sort_unstable();
    let mut cursor = 0u64;
    for (header, end) in spans {
        if header != cursor {
            return bad("the archive has gaps or overlapping entries");
        }
        cursor = end;
    }
    if cursor != cd_start || a.has_overlapping_files()? {
        return bad("the archive has gaps or overlapping entries");
    }
    Ok(())
}
