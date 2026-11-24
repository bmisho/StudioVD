//! Zip bundles: the generic guard and writer (shared with Phase 14 library packs) and the
//! `.stvd` project format built on them.

pub mod guard;
mod layout;
pub mod stvd;
/// Windows device names (CON, NUL, COM1...), refused as file names everywhere.
pub(crate) use layout::reserved;
pub mod writer;

#[cfg(test)]
pub(crate) mod tests;
