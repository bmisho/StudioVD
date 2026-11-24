//! Downloaded zips (GrabCAD and the like, PLAN 16.5): the models in them, ready to import.
//! Not the `.stvd`/pack guard (`bundle/guard.rs`): downloads come from any zip tool, so data
//! descriptors, ZIP64, folder entries and non-ASCII names are fine here. What stays strict:
//! only importable models and the files they name (materials, buffers, textures) are written,
//! under names that stay inside a fresh folder on every OS; every byte is counted against
//! per-file and per-archive limits (zip bombs) and every CRC checked. Never
//! `ZipArchive::extract` (CLAUDE.md §9). The rest is listed as skipped, by name.

use super::archive_names::{is_noise, safe_name, wanted};
use super::{file_name, has_import_extension, MAX_IMPORT_BYTES};
use crate::error::{AppError, AppResult};
use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use zip::{CompressionMethod, ZipArchive};

pub struct Limits {
    pub max_archive_bytes: u64,
    pub max_entries: usize,
    /// All written files together may expand to `archive bytes × max_ratio`, at least
    /// `ratio_floor_bytes`, at most `max_total_bytes`.
    pub max_ratio: u64,
    pub ratio_floor_bytes: u64,
    pub max_total_bytes: u64,
}

pub const LIMITS: Limits = Limits {
    max_archive_bytes: 2 << 30,
    max_entries: 20_000,
    max_ratio: 100,
    ratio_floor_bytes: 256 << 20,
    max_total_bytes: 4 << 30,
};

/// What came out of an archive: models to import, and entries left out, by name.
#[derive(Debug, Default)]
pub struct Unpacked {
    pub models: Vec<PathBuf>,
    pub skipped: Vec<String>,
}

pub fn is_zip(path: &Path) -> bool {
    path.extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("zip"))
}

/// Unpacks the models in `archive` into `dest` (created here; it must not exist, and is
/// removed again on failure). A bad or oversized entry fails the whole archive.
pub fn unpack(archive: &Path, dest: &Path, limits: &Limits) -> AppResult<Unpacked> {
    let refuse = |why: &str| AppError::InvalidInput(format!("{}: {why}", file_name(archive)));
    let file = File::open(archive)?;
    let len = file.metadata()?.len();
    if len > limits.max_archive_bytes {
        return Err(refuse("the archive is too large"));
    }
    let mut zip = ZipArchive::new(BufReader::new(file)).map_err(|e| refuse(&e.to_string()))?;
    if zip.len() > limits.max_entries {
        return Err(refuse("the archive has too many entries"));
    }
    let budget = len
        .saturating_mul(limits.max_ratio)
        .max(limits.ratio_floor_bytes)
        .min(limits.max_total_bytes);
    let mut out = Unpacked::default();
    let mut seen = HashSet::new();
    let mut plan: Vec<(usize, PathBuf)> = Vec::new();
    for i in 0..zip.len() {
        let e = zip.by_index_raw(i).map_err(|e| refuse(&e.to_string()))?;
        let Ok(name) = e.name().map(|n| n.into_owned()) else {
            out.skipped
                .push(String::from_utf8_lossy(e.name_raw()).into_owned());
            continue;
        };
        if e.is_dir() || is_noise(&name) {
            continue;
        }
        let file_type = (e.external_attributes() >> 16) & 0o170_000;
        let regular = !e.is_symlink() && (file_type == 0 || file_type == 0o100_000);
        let readable = !e.encrypted()
            && matches!(
                e.compression(),
                CompressionMethod::Stored | CompressionMethod::Deflated
            )
            && e.size() <= MAX_IMPORT_BYTES;
        match safe_name(&name) {
            Some(path) if regular && readable && wanted(&path) => {
                if seen.insert(name.to_lowercase()) {
                    plan.push((i, path));
                } else {
                    out.skipped.push(name); // differs from another only by case
                }
            }
            _ => out.skipped.push(name),
        }
    }
    // A name that is also another's folder cannot be written: leave the file out.
    let folders: HashSet<String> = plan
        .iter()
        .flat_map(|(_, p)| {
            p.ancestors()
                .skip(1)
                .map(|a| a.to_string_lossy().to_lowercase())
        })
        .collect();
    plan.retain(|(_, p)| {
        let clash = folders.contains(&p.to_string_lossy().to_lowercase());
        if clash {
            out.skipped.push(p.to_string_lossy().into_owned());
        }
        !clash
    });
    fs::create_dir(dest)?; // never extract over anything
    let written = write_all(&mut zip, dest, &plan, budget).map_err(|e| match e {
        AppError::InvalidInput(why) => refuse(&why),
        other => other,
    });
    match written {
        Ok(()) => {
            out.models = plan
                .into_iter()
                .map(|(_, p)| dest.join(p))
                .filter(|p| has_import_extension(p))
                .collect();
            Ok(out)
        }
        Err(e) => {
            let _ = fs::remove_dir_all(dest);
            Err(e)
        }
    }
}

/// Streams each planned entry with counted bytes: declared sizes are only claims.
fn write_all<R: Read + std::io::Seek>(
    zip: &mut ZipArchive<R>,
    dest: &Path,
    plan: &[(usize, PathBuf)],
    budget: u64,
) -> AppResult<()> {
    let mut total = 0u64;
    let mut buf = vec![0u8; 64 * 1024];
    for (i, rel) in plan {
        let mut f = zip.by_index(*i)?;
        let declared = f.size();
        let path = dest.join(rel);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut writer = BufWriter::new(
            OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path)?,
        );
        let mut written = 0u64;
        loop {
            let n = f.read(&mut buf)?; // the zip crate checks the CRC when this returns 0
            if n == 0 {
                break;
            }
            written += n as u64;
            total += n as u64;
            if written > declared.min(MAX_IMPORT_BYTES) || total > budget {
                return Err(AppError::InvalidInput(format!(
                    "{} expands too much",
                    rel.display()
                )));
            }
            writer.write_all(&buf[..n])?;
        }
        if written != declared {
            return Err(AppError::InvalidInput(format!(
                "{} is shorter than it claims",
                rel.display()
            )));
        }
        writer.flush()?;
    }
    Ok(())
}
