//! Free disk space before a download (PLAN 14.3): the pack, then its extracted files, then the
//! blobs it adds to the store, with a margin.

use crate::error::{AppError, AppResult};
use std::path::Path;

const MARGIN: u64 = 64 * 1024 * 1024;

/// The bytes a pack needs while it installs: the archive, its extraction, the store copy.
pub fn needed(bytes: u64, uncompressed: u64) -> u64 {
    bytes
        .saturating_add(uncompressed.saturating_mul(2))
        .saturating_add(MARGIN)
}

/// Ok when the volume of `dir` has `need` bytes free (or cannot say).
pub fn ensure(dir: &Path, need: u64) -> AppResult<()> {
    match fs4::available_space(dir) {
        Ok(free) if free < need => Err(AppError::Io(format!(
            "The disk is full: the pack needs {} MB, {} MB are free.",
            need.div_ceil(1_000_000),
            free / 1_000_000
        ))),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_the_pack_its_files_and_their_copy() {
        assert_eq!(needed(10, 20), 50 + MARGIN);
        assert_eq!(needed(u64::MAX, 1), u64::MAX);
        assert!(ensure(&std::env::temp_dir(), 1).is_ok());
        assert_eq!(
            ensure(&std::env::temp_dir(), u64::MAX).map_err(|e| e.kind()),
            Err("io")
        );
    }
}
