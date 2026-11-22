//! Settings › Network (PLAN 4.7, 14.4): per machine, in `<app local data>/network.json`.
//! Nothing here is secret (no proxy passwords: reqwest cannot answer NTLM/Negotiate anyway,
//! and Install from file covers those networks).

use crate::error::{AppError, AppResult};
use crate::fsutil::write_atomic;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

const MAX_URL: usize = 512;
const MAX_SETTINGS_BYTES: u64 = 64 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(tag = "mode", rename_all = "camelCase", deny_unknown_fields)]
pub enum ProxySetting {
    /// Windows: the Internet Settings proxy, read by us; Linux: the proxy environment variables.
    #[default]
    System,
    None,
    Manual {
        url: String,
        /// Hosts that go direct, comma separated (`*` wildcards, `<local>`).
        #[serde(default)]
        bypass: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NetworkSettings {
    /// No network use at all.
    pub offline: bool,
    /// The user agreed, once, to the hosts the consent dialog named.
    pub consented: bool,
    pub proxy: ProxySetting,
    /// A server holding the same files as the official hosts (`https://…/`).
    pub mirror: Option<String>,
    /// Opt-in: look for catalog updates at most once a week, on start.
    pub weekly_check: bool,
    /// Seconds since 1970 of the last successful catalog refresh (set by Rust only).
    #[serde(default)]
    pub last_check: Option<u64>,
    /// The file name of the extra trusted CA (set by Rust only, from its dialog).
    #[serde(default)]
    pub extra_ca: Option<String>,
}

impl Default for NetworkSettings {
    fn default() -> Self {
        Self {
            offline: false,
            consented: false,
            proxy: ProxySetting::System,
            mirror: None,
            weekly_check: false,
            last_check: None,
            extra_ca: None,
        }
    }
}

fn bad<T>(reason: impl Into<String>) -> AppResult<T> {
    Err(AppError::InvalidInput(reason.into()))
}

/// An `https://` base URL without credentials, query or fragment, ending in `/`.
pub fn check_mirror(value: &str) -> AppResult<String> {
    let v = value.trim();
    if v.len() > MAX_URL {
        return bad("The mirror URL is too long.");
    }
    let Ok(url) = Url::parse(v) else {
        return bad("The mirror is not a URL.");
    };
    if url.scheme() != "https" || url.host_str().is_none() {
        return bad("The mirror must be an https:// address.");
    }
    if !url.username().is_empty() || url.password().is_some() {
        return bad("The mirror URL must not hold a user name or password.");
    }
    if url.query().is_some() || url.fragment().is_some() {
        return bad("The mirror URL must not have a query or fragment.");
    }
    let s = url.to_string();
    Ok(if s.ends_with('/') { s } else { format!("{s}/") })
}

fn check_proxy(proxy: &ProxySetting) -> AppResult<()> {
    let ProxySetting::Manual { url, bypass } = proxy else {
        return Ok(());
    };
    if url.len() > MAX_URL || bypass.len() > 2048 {
        return bad("The proxy setting is too long.");
    }
    let with_scheme = if url.contains("://") {
        url.clone()
    } else {
        format!("http://{url}")
    };
    let Ok(parsed) = Url::parse(with_scheme.trim()) else {
        return bad("The proxy is not host:port or a URL.");
    };
    if !matches!(parsed.scheme(), "http" | "https" | "socks5" | "socks5h") {
        return bad("The proxy must be http, https or socks5.");
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return bad("Proxy sign-in is not supported; use Install from file on such a network.");
    }
    if parsed.host_str().is_none() {
        return bad("The proxy has no host.");
    }
    Ok(())
}

impl NetworkSettings {
    /// The settings as the webview sent them, checked and normalized.
    pub fn checked(mut self) -> AppResult<Self> {
        check_proxy(&self.proxy)?;
        self.mirror = match self.mirror.as_deref().map(str::trim) {
            None | Some("") => None,
            Some(m) => Some(check_mirror(m)?),
        };
        Ok(self)
    }

    /// The saved settings, or the defaults when there are none or they cannot be read.
    pub fn load(path: &Path) -> Self {
        let read = || -> Option<Self> {
            let meta = fs::metadata(path).ok()?;
            if meta.len() > MAX_SETTINGS_BYTES {
                return None;
            }
            let parsed: Self = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
            parsed.checked().ok()
        };
        read().unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> AppResult<()> {
        let json = serde_json::to_vec_pretty(self).map_err(|e| {
            AppError::Io(format!("The network settings could not be written ({e})."))
        })?;
        write_atomic(path, &json)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mirrors_are_https_bases_without_credentials() {
        assert_eq!(
            check_mirror(" https://mirror.example/lib ").expect("valid"),
            "https://mirror.example/lib/"
        );
        assert!(check_mirror("http://mirror.example/").is_err());
        assert!(check_mirror("https://u:p@mirror.example/").is_err());
        assert!(check_mirror("https://mirror.example/?a=1").is_err());
        assert!(check_mirror("not a url").is_err());
    }

    #[test]
    fn proxies_without_sign_in() {
        let manual = |url: &str| ProxySetting::Manual {
            url: url.into(),
            bypass: String::new(),
        };
        assert!(check_proxy(&manual("proxy:8080")).is_ok());
        assert!(check_proxy(&manual("socks5://s:1080")).is_ok());
        assert!(check_proxy(&manual("http://me:secret@proxy:8080")).is_err());
        assert!(check_proxy(&manual("ftp://proxy")).is_err());
    }

    #[test]
    fn unreadable_settings_fall_back_to_defaults() {
        let dir = std::env::temp_dir().join(format!("stvd-net-{}", std::process::id()));
        fs::create_dir_all(&dir).expect("temp dir");
        let path = dir.join("network.json");
        fs::write(&path, b"{\"offline\": 3}").expect("write");
        assert_eq!(NetworkSettings::load(&path), NetworkSettings::default());
        let s = NetworkSettings {
            offline: true,
            ..NetworkSettings::default()
        };
        s.save(&path).expect("save");
        assert!(NetworkSettings::load(&path).offline);
        let _ = fs::remove_dir_all(&dir);
    }
}
