//! Zip bundles: the generic guard and writer (shared with Phase 14 library packs) and the
//! `.stvd` project format built on them.

pub mod guard;
mod layout;
pub mod stvd;
pub mod writer;

#[cfg(test)]
mod tests;
