//! Deterministic zip writing: fixed timestamps, Unix attributes, mode 0644 and the caller's
//! entry order, so the same project saves to the same bytes on Windows and Linux.

use super::guard::check_name;
use crate::error::{AppError, AppResult};
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{self, BufReader, BufWriter, Read, Write};
use std::path::PathBuf;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, DateTime, System, ZipWriter};

pub enum Source<'a> {
    Bytes(&'a [u8]),
    /// A file copied in while its SHA-256 is checked: a content-addressed file that does not
    /// match its name is damaged, and is never written into a bundle.
    File {
        path: PathBuf,
        sha256: [u8; 32],
    },
}

pub struct Entry<'a> {
    pub name: String,
    pub source: Source<'a>,
    /// Deflate (JSON, GLB, text) or store (PNG and JPG are compressed already).
    pub compress: bool,
}

struct Hashing<R> {
    inner: R,
    hasher: Sha256,
}

impl<R: Read> Read for Hashing<R> {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let n = self.inner.read(buf)?;
        self.hasher.update(&buf[..n]);
        Ok(n)
    }
}

/// Writes `entries` as a zip into `file` (an empty file the caller made). Names follow the
/// same rules the reader enforces, so we never write an archive we would refuse to open.
pub fn write_zip(file: &mut File, entries: &[Entry<'_>], max_name_len: usize) -> AppResult<()> {
    let mut zip = ZipWriter::new(BufWriter::new(file));
    let base = SimpleFileOptions::default()
        .last_modified_time(DateTime::default()) // 1980-01-01 00:00
        .system(System::Unix)
        .unix_permissions(0o644)
        .large_file(false);
    for entry in entries {
        check_name(entry.name.as_bytes(), max_name_len)?;
        let options = if entry.compress {
            base.compression_method(CompressionMethod::Deflated)
                .compression_level(Some(6))
        } else {
            base.compression_method(CompressionMethod::Stored)
        };
        zip.start_file(entry.name.as_str(), options)?;
        match &entry.source {
            Source::Bytes(bytes) => zip.write_all(bytes)?,
            Source::File { path, sha256 } => {
                let mut reader = Hashing {
                    inner: BufReader::new(File::open(path).map_err(|e| missing(&entry.name, e))?),
                    hasher: Sha256::new(),
                };
                io::copy(&mut reader, &mut zip)?;
                if reader.hasher.finalize().as_slice() != sha256 {
                    return Err(AppError::Io(format!(
                        "{} in the working folder is damaged; nothing was saved.",
                        entry.name
                    )));
                }
            }
        }
    }
    zip.finish()?
        .into_inner()
        .map_err(|e| AppError::Io(e.to_string()))?
        .flush()?;
    Ok(())
}

fn missing(name: &str, e: io::Error) -> AppError {
    if e.kind() == io::ErrorKind::NotFound {
        AppError::Io(format!(
            "{name} is missing from the working folder; nothing was saved."
        ))
    } else {
        e.into()
    }
}
