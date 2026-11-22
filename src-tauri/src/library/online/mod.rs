//! The online catalog (PLAN 4.4, Phase 14): a signed index fetched on an explicit action,
//! verified before it is parsed, cached with a rollback guard; packs downloaded and checked
//! against it, then installed through the same staging as Install from file.

pub mod cache;
pub mod catalog;
pub mod fetch;
pub mod jobs;
pub mod meta;
pub mod previews;
pub mod request;
pub mod retry;
pub mod signed;
pub mod source;
pub mod space;
pub mod trust;

#[cfg(test)]
mod tests;
