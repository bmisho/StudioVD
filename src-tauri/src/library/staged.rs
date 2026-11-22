//! Packs extracted and checked, waiting for the webview's validation and, for Install from
//! file, the user's confirmation: one picked file at a time, plus catalog downloads.

use super::install::Staged;
use super::installed::Origin;

/// Most packs waiting at once; the oldest is dropped past it.
pub const MAX_STAGED: usize = 4;

#[derive(Default)]
pub struct StagedSet(Vec<Staged>);

impl StagedSet {
    /// Adds `staged`; returns what it displaces (an earlier picked file, the oldest past the
    /// cap), for the caller to delete.
    pub fn put(&mut self, staged: Staged) -> Vec<Staged> {
        let mut gone = Vec::new();
        if staged.origin == Origin::Sideloaded {
            let (old, keep) = std::mem::take(&mut self.0)
                .into_iter()
                .partition(|s| s.origin == Origin::Sideloaded);
            self.0 = keep;
            gone = old;
        }
        self.0.push(staged);
        while self.0.len() > MAX_STAGED {
            gone.push(self.0.remove(0));
        }
        gone
    }

    pub fn take(&mut self, token: &str) -> Option<Staged> {
        let at = self.0.iter().position(|s| s.token == token)?;
        Some(self.0.remove(at))
    }
}
