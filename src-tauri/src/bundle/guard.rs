//! Strict extraction of untrusted zip archives (`.stvd` projects, `.stvdpack` library packs).
//! Never `ZipArchive::extract` (CLAUDE.md §9): it follows symlinks, overwrites files, applies
//! stored permissions and has no limits. This reader accepts only plain, contiguous archives
//! of regular files with safe names, and counts every byte it writes.

pub use super::layout::check_name;
use super::layout::{check_central_directory, check_layout, read_eocd};
use crate::error::{AppError, AppResult};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::{BufWriter, Read, Seek, SeekFrom, Write};
use std::path::Path;
use zip::{CompressionMethod, ZipArchive};

pub struct Limits {
    /// The archive file itself. Below 4 GiB: ZIP64 is refused.
    pub max_archive_bytes: u64,
    pub max_entries: usize,
    /// All entries together, uncompressed.
    pub max_total_bytes: u64,
    /// All entries together may expand to at most `archive bytes × max_ratio` (zip bombs),
    /// or `ratio_floor_bytes` for a small archive. One budget per archive: a floor per entry
    /// would let thousands of tiny entries add up to gigabytes.
    pub max_ratio: u64,
    pub ratio_floor_bytes: u64,
    pub max_name_len: usize,
}

/// One extracted file.
pub struct Extracted {
    pub name: String,
    pub sha256: [u8; 32],
}

pub(super) fn bad<T>(reason: impl Into<String>) -> AppResult<T> {
    Err(AppError::InvalidInput(reason.into()))
}

impl From<zip::result::ZipError> for AppError {
    fn from(e: zip::result::ZipError) -> Self {
        AppError::InvalidInput(e.to_string())
    }
}

/// Extracts `reader` into `dest`, which must not exist yet (it is created here and removed
/// again on any failure). `rule(name)` gives each allowed entry's size cap, `None` refuses
/// it. Every entry is a regular, unencrypted, stored or deflated file; names are unique
/// (case-insensitively) and no name is also another's folder. Bytes are counted while
/// streaming (declared sizes are only claims), checked against the CRC, and hashed.
pub fn extract_zip<R: Read + Seek>(
    reader: R,
    dest: &Path,
    limits: &Limits,
    rule: impl Fn(&str) -> Option<u64>,
) -> AppResult<Vec<Extracted>> {
    let (mut archive, entries, budget) = open_checked(reader, limits, &rule)?;
    fs::create_dir(dest)?; // fails if it exists: never extract over anything
    let result = write_entries(&mut archive, dest, budget, entries);
    if result.is_err() {
        let _ = fs::remove_dir_all(dest);
    }
    result
}

/// Every check that needs no decompression (declared sizes included): what a save runs on
/// its own output, so it never writes an archive extraction would refuse. Returns the names.
pub fn inspect_zip<R: Read + Seek>(
    reader: R,
    limits: &Limits,
    rule: impl Fn(&str) -> Option<u64>,
) -> AppResult<Vec<String>> {
    let (_, entries, _) = open_checked(reader, limits, &rule)?;
    Ok(entries.into_iter().map(|(name, _)| name).collect())
}

/// The archive, its entries with their size caps, and how many bytes they may expand to.
type Checked<R> = (ZipArchive<R>, Vec<(String, u64)>, u64);

fn open_checked<R: Read + Seek>(
    mut reader: R,
    limits: &Limits,
    rule: &impl Fn(&str) -> Option<u64>,
) -> AppResult<Checked<R>> {
    let file_len = reader.seek(SeekFrom::End(0))?;
    if file_len > limits.max_archive_bytes {
        return bad("the archive is too large");
    }
    let eocd = read_eocd(&mut reader, file_len)?;
    if usize::from(eocd.entries) > limits.max_entries {
        return bad("the archive has too many entries");
    }
    check_central_directory(&mut reader, &eocd)?;
    let budget = file_len
        .saturating_mul(limits.max_ratio)
        .max(limits.ratio_floor_bytes)
        .min(limits.max_total_bytes);
    let mut archive = ZipArchive::new(reader)?;
    check_layout(&mut archive, &eocd)?;
    let entries = check_entries(&mut archive, limits, budget, rule)?;
    Ok((archive, entries, budget))
}

/// Metadata pass, nothing decompressed yet. Returns (name, size cap) per entry.
fn check_entries<R: Read + Seek>(
    a: &mut ZipArchive<R>,
    limits: &Limits,
    budget: u64,
    rule: &impl Fn(&str) -> Option<u64>,
) -> AppResult<Vec<(String, u64)>> {
    let mut seen = HashSet::new();
    let mut declared_total = 0u64;
    let mut entries = Vec::with_capacity(a.len());
    for i in 0..a.len() {
        let e = a.by_index_raw(i)?;
        let name = check_name(e.name_raw(), limits.max_name_len)?.to_owned();
        let file_type = (e.external_attributes() >> 16) & 0o170_000;
        if e.is_dir() || e.is_symlink() || (file_type != 0 && file_type != 0o100_000) {
            return bad(format!("entry {name:?} is not a regular file"));
        }
        if e.encrypted() {
            return bad(format!("entry {name:?} is encrypted"));
        }
        if !matches!(
            e.compression(),
            CompressionMethod::Stored | CompressionMethod::Deflated
        ) {
            return bad(format!("entry {name:?} uses an unsupported compression"));
        }
        if e.enclosed_name().as_deref() != Some(Path::new(&name)) {
            return bad(format!("entry {name:?} is not a plain relative path"));
        }
        let Some(cap) = rule(&name) else {
            return bad(format!("unexpected entry {name:?}"));
        };
        if !seen.insert(name.to_ascii_lowercase()) {
            return bad(format!("entry {name:?} appears twice"));
        }
        if e.size() > cap {
            return bad(format!("entry {name:?} is too large"));
        }
        declared_total = declared_total.saturating_add(e.size());
        entries.push((name, cap));
    }
    if declared_total > budget {
        return bad("the archive expands too much");
    }
    for (name, _) in &entries {
        let mut prefix = name.as_str();
        while let Some(i) = prefix.rfind('/') {
            prefix = &prefix[..i];
            if seen.contains(&prefix.to_ascii_lowercase()) {
                return bad(format!("entry {prefix:?} is both a file and a folder"));
            }
        }
    }
    Ok(entries)
}

/// Streams each entry with counted bytes: declared sizes are only claims, so every entry
/// stops at its declared size and cap, and all of them at the archive's budget.
fn write_entries<R: Read + Seek>(
    a: &mut ZipArchive<R>,
    dest: &Path,
    budget: u64,
    entries: Vec<(String, u64)>,
) -> AppResult<Vec<Extracted>> {
    let mut total = 0u64;
    let mut buf = vec![0u8; 64 * 1024];
    let mut out = Vec::with_capacity(entries.len());
    for (i, (name, cap)) in entries.into_iter().enumerate() {
        let mut f = a.by_index(i)?;
        let declared = f.size();
        let cap = cap.min(declared);
        let path = dest.join(&name);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)?;
        let mut writer = BufWriter::new(file);
        let mut hasher = Sha256::new();
        let mut written = 0u64;
        loop {
            let n = f.read(&mut buf)?; // the zip crate checks the CRC when this returns 0
            if n == 0 {
                break;
            }
            written += n as u64;
            total += n as u64;
            if written > cap || total > budget {
                return bad(format!("entry {name:?} expands too much"));
            }
            hasher.update(&buf[..n]);
            writer.write_all(&buf[..n])?;
        }
        if written != declared {
            return bad(format!("entry {name:?} is shorter than it claims"));
        }
        writer
            .into_inner()
            .map_err(|e| AppError::Io(e.to_string()))?
            .sync_all()?;
        out.push(Extracted {
            name,
            sha256: hasher.finalize().into(),
        });
    }
    Ok(out)
}
