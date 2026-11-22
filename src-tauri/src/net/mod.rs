//! Network access (PLAN 4.7, Phase 14): the only network code in the app, used by the
//! catalog and pack downloads in `library::online`, only on an explicit user action.

pub mod client;
pub mod diagnose;
pub mod proxy_plan;
pub mod settings;
pub mod winproxy;

#[cfg(test)]
mod tests;
