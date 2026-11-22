//! The parts of a verified catalog index (`index.json`, PLAN 4.4) Rust needs for trust
//! decisions: which packs exist and what each holds. The webview validates the whole index
//! strictly (`CatalogIndexSchema`); unknown fields are ignored here.

use crate::error::{AppError, AppResult};
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexMeta {
    pub format: String,
    pub schema_version: u32,
    pub catalog_id: String,
    pub sequence: u64,
    pub expires_at: String,
    pub min_app_version: String,
    pub signing_key_id: String,
    pub mirrors: Vec<String>,
    pub packs: HashMap<String, PackEntry>,
    pub components: Vec<ComponentRef>,
    #[serde(default)]
    pub preview_packs: HashMap<String, String>,
    #[serde(default)]
    pub generator_presets: Vec<PresetRef>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackEntry {
    pub url: String,
    pub sha256: String,
    pub bytes: u64,
    pub uncompressed_bytes: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentRef {
    pub id: String,
    pub version: String,
    pub manifest_sha256: String,
    pub pack: String,
    pub thumbnail: ThumbRef,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ThumbRef {
    pub pack: String,
    pub path: String,
    pub sha256: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetRef {
    pub id: String,
    pub version: String,
    pub manifest_sha256: String,
    pub pack: String,
}

impl IndexMeta {
    pub fn parse(bytes: &[u8]) -> AppResult<Self> {
        serde_json::from_slice(bytes).map_err(|e| {
            AppError::InvalidInput(format!("The catalog index is not readable ({e})."))
        })
    }

    /// The manifest SHA-256 the index gives `id@version` in `pack`, if it lists it there.
    pub fn manifest_in(&self, pack: &str, id: &str, version: &str) -> Option<&str> {
        let component = self
            .components
            .iter()
            .find(|c| c.pack == pack && c.id == id && c.version == version)
            .map(|c| c.manifest_sha256.as_str());
        component.or_else(|| {
            self.generator_presets
                .iter()
                .find(|g| g.pack == pack && g.id == id && g.version == version)
                .map(|g| g.manifest_sha256.as_str())
        })
    }

    /// Packs that hold thumbnails (preview packs), without duplicates.
    pub fn preview_pack_ids(&self) -> Vec<&str> {
        let mut ids: Vec<&str> = self.preview_packs.values().map(String::as_str).collect();
        ids.sort_unstable();
        ids.dedup();
        ids
    }
}

/// Seconds since 1970 of `YYYY-MM-DDTHH:MM:SS(.fff)Z` (the schema's ISO UTC form).
pub fn iso_secs(s: &str) -> Option<u64> {
    let b = s.as_bytes();
    if b.len() < 20 || b[4] != b'-' || b[7] != b'-' || b[10] != b'T' || !s.ends_with('Z') {
        return None;
    }
    let num = |r: std::ops::Range<usize>| s.get(r)?.parse::<u64>().ok();
    let (y, mo, d) = (num(0..4)?, num(5..7)?, num(8..10)?);
    let (h, mi, se) = (num(11..13)?, num(14..16)?, num(17..19)?);
    if !(1..=12).contains(&mo) || !(1..=31).contains(&d) || h > 23 || mi > 59 || se > 60 {
        return None;
    }
    Some(days_from_civil(y, mo, d)? * 86_400 + h * 3600 + mi * 60 + se)
}

/// Days since 1970-01-01 of a proleptic Gregorian date (H. Hinnant's algorithm).
pub fn days_from_civil(y: u64, m: u64, d: u64) -> Option<u64> {
    let y = if m <= 2 { y.checked_sub(1)? } else { y };
    let era = y / 400;
    let yoe = y - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    (era * 146_097 + doe).checked_sub(719_468)
}

/// `app` is `min` or later (SemVer: a pre-release comes before its release).
pub fn version_at_least(app: &str, min: &str) -> bool {
    fn parts(v: &str) -> Option<([u64; 3], bool)> {
        let core = v.split('+').next()?;
        let (nums, pre) = match core.split_once('-') {
            Some((n, _)) => (n, true),
            None => (core, false),
        };
        let mut it = nums.split('.').map(|p| p.parse::<u64>().ok());
        let out = [it.next()??, it.next()??, it.next()??];
        it.next().is_none().then_some((out, pre))
    }
    match (parts(app), parts(min)) {
        (Some((a, a_pre)), Some((m, m_pre))) => a > m || (a == m && (!a_pre || m_pre)),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso_times() {
        assert_eq!(iso_secs("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(iso_secs("2000-03-01T00:00:00Z"), Some(951_868_800));
        assert_eq!(iso_secs("2026-10-09T12:00:00.250Z"), Some(1_791_547_200));
        assert_eq!(iso_secs("2026-13-09T12:00:00Z"), None);
        assert_eq!(iso_secs("2026-10-09 12:00:00Z"), None);
        assert_eq!(iso_secs("2026-10-09T12:00:00+01:00"), None);
    }

    #[test]
    fn app_versions() {
        assert!(version_at_least("0.4.0", "0.4.0"));
        assert!(version_at_least("0.10.0", "0.9.9"));
        assert!(!version_at_least("0.3.9", "0.4.0"));
        assert!(!version_at_least("0.4.0-beta.1", "0.4.0"));
        assert!(version_at_least("0.4.0", "0.4.0-beta.1"));
        assert!(!version_at_least("x", "0.1.0"));
    }
}
