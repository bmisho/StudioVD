//! The catalogs this build trusts (PLAN 4.4): minisign public keys compiled in, and the hosts
//! that serve them. Hosts are untrusted (trust comes only from the signatures), so a user
//! mirror can serve the same files.
//!
//! The official catalog (PLAN 14.1/14.2): signed with the owner's keys (active, then the
//! offline backup) and published as GitHub releases of bmisho/studiovd-catalog, whose
//! publish workflow signs `index.json` into the release marked latest.

/// One signed catalog: its id (the index's `catalogId`), the keys that may sign it, where its
/// `index.json` (+ `.minisig`) lives, and the bases its packs' relative URLs resolve against.
pub struct CatalogSource {
    pub id: &'static str,
    /// minisign public keys (the base64 line of `minisign.pub`), active first.
    pub keys: &'static [&'static str],
    pub index_bases: &'static [&'static str],
    pub pack_bases: &'static [&'static str],
    /// Hosts the bases redirect to (named in the consent dialog with the bases' own hosts).
    pub redirect_hosts: &'static [&'static str],
}

pub const OFFICIAL: CatalogSource = CatalogSource {
    id: "official",
    // Created by the owner on 2026-11-23 (docs/catalog-signing.md). Key ids: A26FD5C302F7F8FB
    // (active, signs every publish), 97EEE73CB6AC658E (backup, kept offline).
    keys: &[
        "RWT7+PcCw9Vvols8Pi3Ar0x9gYuBFRJbvhdIo4cx0Pwbrr+eaQhidO70",
        "RWSOZay2POful1LzQR6TTV8gBHqHH0hvSRLnJ8if9BEOgby/OcF67gyg",
    ],
    // `latest/download/` follows the release marked latest (the newest catalog); packs live in
    // their own releases (`<tag>/<file>`, never marked latest).
    index_bases: &["https://github.com/bmisho/studiovd-catalog/releases/latest/download/"],
    pack_bases: &["https://github.com/bmisho/studiovd-catalog/releases/download/"],
    // GitHub serves release files from here (checked 2026-11-23: two redirects).
    redirect_hosts: &["release-assets.githubusercontent.com"],
};

impl CatalogSource {
    pub fn configured(&self) -> bool {
        !self.keys.is_empty() && !self.index_bases.is_empty()
    }

    /// Index URLs to try in order: ours, then the user's mirror.
    pub fn index_urls(&self, mirror: Option<&str>) -> Vec<String> {
        let mut out: Vec<String> = self
            .index_bases
            .iter()
            .map(|b| format!("{b}index.json"))
            .collect();
        if let Some(m) = mirror {
            out.push(format!("{m}index.json"));
        }
        out
    }

    /// Pack bases to try in order: ours, the user's mirror, then the index's own list (a hint
    /// from a verified index; every pack is checked by its SHA-256 anyway).
    pub fn pack_bases(&self, mirror: Option<&str>, listed: &[String]) -> Vec<String> {
        let mut out: Vec<String> = self.pack_bases.iter().map(|b| (*b).to_owned()).collect();
        out.extend(mirror.map(str::to_owned));
        for base in listed {
            let base = if base.ends_with('/') {
                base.clone()
            } else {
                format!("{base}/")
            };
            if base.starts_with("https://") && !out.contains(&base) {
                out.push(base);
            }
        }
        out
    }

    /// The hosts the consent dialog names.
    pub fn hosts(&self, mirror: Option<&str>) -> Vec<String> {
        let mut out: Vec<String> = self
            .index_bases
            .iter()
            .chain(self.pack_bases)
            .copied()
            .chain(mirror)
            .filter_map(|u| reqwest::Url::parse(u).ok()?.host_str().map(str::to_owned))
            .chain(self.redirect_hosts.iter().map(|h| (*h).to_owned()))
            .collect();
        out.sort();
        out.dedup();
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST: CatalogSource = CatalogSource {
        id: "official",
        keys: &["k"],
        index_bases: &["https://a.example/latest/"],
        pack_bases: &["https://a.example/dl/"],
        redirect_hosts: &["cdn.example"],
    };

    #[test]
    fn urls_in_order_and_hosts_named() {
        assert_eq!(
            TEST.index_urls(Some("https://m.example/")),
            [
                "https://a.example/latest/index.json",
                "https://m.example/index.json"
            ]
        );
        let listed = [
            "https://r2.example/x".to_owned(),
            "http://plain.example/".to_owned(),
        ];
        assert_eq!(
            TEST.pack_bases(None, &listed),
            ["https://a.example/dl/", "https://r2.example/x/"]
        );
        assert_eq!(
            TEST.hosts(Some("https://m.example/")),
            ["a.example", "cdn.example", "m.example"]
        );
        assert!(OFFICIAL.configured());
        assert_eq!(
            OFFICIAL.hosts(None),
            ["github.com", "release-assets.githubusercontent.com"]
        );
    }

    #[test]
    fn official_keys_parse_with_their_ids() {
        for k in OFFICIAL.keys {
            assert!(minisign_verify::PublicKey::from_base64(k).is_ok(), "{k}");
        }
        let ids: Vec<_> = OFFICIAL
            .keys
            .iter()
            .map(|k| super::super::signed::key_id(k))
            .collect();
        assert_eq!(
            ids,
            [
                Some("A26FD5C302F7F8FB".to_owned()),
                Some("97EEE73CB6AC658E".to_owned())
            ]
        );
    }
}
