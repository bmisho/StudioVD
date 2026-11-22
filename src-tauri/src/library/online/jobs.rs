//! Downloads in progress (PLAN 14.3): at most two at a time, one per pack, each cancellable.

use crate::error::{AppError, AppResult};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use tokio_util::sync::CancellationToken;

pub const CONCURRENT_DOWNLOADS: usize = 2;

pub struct Downloads {
    slots: Arc<Semaphore>,
    active: Mutex<HashMap<String, CancellationToken>>,
}

/// One download's place: its cancellation token, released (and forgotten) on drop.
pub struct Job<'a> {
    downloads: &'a Downloads,
    key: String,
    pub cancel: CancellationToken,
}

impl Drop for Job<'_> {
    fn drop(&mut self) {
        if let Ok(mut active) = self.downloads.active.lock() {
            active.remove(&self.key);
        }
    }
}

impl Default for Downloads {
    fn default() -> Self {
        Self {
            slots: Arc::new(Semaphore::new(CONCURRENT_DOWNLOADS)),
            active: Mutex::new(HashMap::new()),
        }
    }
}

impl Downloads {
    /// Registers a download of `key` (a pack's SHA-256); refused while one runs already.
    pub fn begin(&self, key: &str) -> AppResult<Job<'_>> {
        let mut active = self
            .active
            .lock()
            .map_err(|_| AppError::Io("The download list is unavailable.".into()))?;
        if active.contains_key(key) {
            return Err(AppError::InvalidInput(
                "That pack is being downloaded already.".into(),
            ));
        }
        let cancel = CancellationToken::new();
        active.insert(key.to_owned(), cancel.clone());
        Ok(Job {
            downloads: self,
            key: key.to_owned(),
            cancel,
        })
    }

    /// Waits for one of the download slots (or for the job's cancellation).
    pub async fn slot(&self, job: &Job<'_>) -> AppResult<OwnedSemaphorePermit> {
        tokio::select! {
            _ = job.cancel.cancelled() => Err(AppError::Cancelled("The download was cancelled.".into())),
            permit = self.slots.clone().acquire_owned() => permit
                .map_err(|_| AppError::Io("The download slots are closed.".into())),
        }
    }

    /// Cancels the download of `key`, if one runs; true when it did.
    pub fn cancel(&self, key: &str) -> bool {
        let active = self.active.lock();
        let token = active.ok().and_then(|a| a.get(key).cloned());
        token.map(|t| t.cancel()).is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn one_job_per_pack_and_two_slots() {
        let d = Downloads::default();
        let a = d.begin("a").expect("first");
        assert!(d.begin("a").is_err());
        let b = d.begin("b").expect("second");
        let c = d.begin("c").expect("third");
        let _pa = d.slot(&a).await.expect("slot a");
        let _pb = d.slot(&b).await.expect("slot b");
        assert!(d.cancel("c"));
        assert_eq!(
            d.slot(&c).await.map(|_| ()).unwrap_err().kind(),
            "cancelled"
        );
        drop(a);
        assert!(d.begin("a").is_ok());
        assert!(!d.cancel("zzz"));
    }
}
