//! The command ACL stays complete (PLAN 15.2): every command `generate_handler!` registers is
//! in `build.rs`'s app manifest and granted to the main window, and nothing else is.

use std::collections::BTreeSet;

const LIB: &str = include_str!("lib.rs");
const BUILD: &str = include_str!("../build.rs");
const CAPABILITY: &str = include_str!("../capabilities/default.json");

fn registered() -> BTreeSet<String> {
    let start = LIB.find("generate_handler![").unwrap_or(0);
    let end = LIB[start..].find("])").map_or(LIB.len(), |e| start + e);
    LIB[start..end]
        .lines()
        .filter_map(|l| l.trim().strip_prefix("commands::"))
        .filter_map(|l| {
            l.trim_end_matches(',')
                .rsplit("::")
                .next()
                .map(str::to_owned)
        })
        .collect()
}

fn in_manifest() -> BTreeSet<String> {
    let start = BUILD.find("COMMANDS").unwrap_or(0);
    let end = BUILD[start..].find("];").map_or(BUILD.len(), |e| start + e);
    BUILD[start..end]
        .lines()
        .filter_map(|l| {
            l.trim()
                .strip_prefix('"')?
                .strip_suffix("\",")
                .map(str::to_owned)
        })
        .collect()
}

fn granted() -> (BTreeSet<String>, Vec<String>) {
    let json: serde_json::Value = serde_json::from_str(CAPABILITY).unwrap_or_default();
    let all: Vec<String> = json["permissions"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|p| p.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default();
    let commands = all
        .iter()
        .filter_map(|p| p.strip_prefix("allow-"))
        .map(|p| p.replace('-', "_"))
        .collect();
    let core = all.into_iter().filter(|p| p.starts_with("core:")).collect();
    (commands, core)
}

#[test]
fn every_command_is_declared_and_granted_once() {
    let commands = registered();
    assert!(commands.len() > 40, "generate_handler! was not found");
    assert_eq!(in_manifest(), commands, "build.rs COMMANDS");
    let (granted, core) = granted();
    assert_eq!(granted, commands, "capabilities/default.json");
    // No broad defaults: only the core permissions the UI uses (events, closing the window).
    assert_eq!(
        core,
        [
            "core:event:allow-listen",
            "core:event:allow-unlisten",
            "core:window:allow-close"
        ]
    );
}
