//! Which proxy a request goes through (PLAN 4.7, 14.4). Pure: the Windows registry values
//! and the manual settings are parsed here and turned into one reqwest `Proxy::custom`.
//!
//! hyper-util 0.1.21 reads the Windows `ProxyServer` value verbatim and cannot parse the
//! per-protocol form (`http=h:p;https=h:p`), so the request silently goes direct. We parse it
//! ourselves, with the `ProxyOverride` bypass list (`*.corp;10.*;<local>`).

use reqwest::Url;

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ProxyPlan {
    /// The proxy for `http://` requests.
    pub http: Option<String>,
    /// The proxy for `https://` requests.
    pub https: Option<String>,
    /// Host patterns that go direct (`*` wildcards, case-insensitive).
    pub bypass: Vec<String>,
    /// `<local>`: host names without a dot go direct.
    pub bypass_local: bool,
}

/// `host:port` or a URL → a proxy URL (`http://` unless it names its scheme).
fn proxy_url(value: &str) -> Option<String> {
    let v = value.trim();
    if v.is_empty() {
        return None;
    }
    let with_scheme = if v.contains("://") {
        v.to_owned()
    } else {
        format!("http://{v}")
    };
    let url = Url::parse(&with_scheme).ok()?;
    matches!(url.scheme(), "http" | "https" | "socks5" | "socks5h")
        .then(|| url.host_str().is_some())
        .filter(|ok| *ok)
        .map(|_| with_scheme)
}

impl ProxyPlan {
    /// The Windows `ProxyServer` and `ProxyOverride` values (Internet Settings).
    #[cfg_attr(not(windows), allow(dead_code))] // read only on Windows; tested everywhere
    pub fn from_windows(server: &str, overrides: &str) -> Self {
        let mut plan = Self::default();
        if server.contains('=') {
            for part in server.split(';') {
                let Some((scheme, value)) = part.split_once('=') else {
                    continue;
                };
                match scheme.trim().to_ascii_lowercase().as_str() {
                    "http" => plan.http = proxy_url(value),
                    "https" => plan.https = proxy_url(value),
                    // A SOCKS-only setting applies to both when nothing more specific does.
                    "socks" => {
                        let socks = proxy_url(&format!("socks5://{}", value.trim()));
                        plan.http = plan.http.or_else(|| socks.clone());
                        plan.https = plan.https.or(socks);
                    }
                    _ => {}
                }
            }
        } else {
            plan.http = proxy_url(server);
            plan.https = plan.http.clone();
        }
        plan.set_bypass(overrides, ';');
        plan
    }

    /// One proxy for every request, with a comma or semicolon separated bypass list.
    pub fn manual(url: &str, bypass: &str) -> Option<Self> {
        let proxy = proxy_url(url)?;
        let mut plan = Self {
            http: Some(proxy.clone()),
            https: Some(proxy),
            ..Self::default()
        };
        plan.set_bypass(bypass, ',');
        Some(plan)
    }

    fn set_bypass(&mut self, list: &str, sep: char) {
        for entry in list
            .split([sep, ';'])
            .map(str::trim)
            .filter(|e| !e.is_empty())
        {
            if entry.eq_ignore_ascii_case("<local>") {
                self.bypass_local = true;
            } else {
                self.bypass.push(entry.to_ascii_lowercase());
            }
        }
    }

    /// The proxy for `url`, or None to connect directly.
    pub fn proxy_for(&self, url: &Url) -> Option<&str> {
        let host = url
            .host_str()?
            .trim_start_matches('[')
            .trim_end_matches(']');
        let host = host.to_ascii_lowercase();
        if self.bypass_local && !host.contains('.') && !host.contains(':') {
            return None;
        }
        if self.bypass.iter().any(|p| glob(p, &host)) {
            return None;
        }
        match url.scheme() {
            "http" => self.http.as_deref(),
            "https" => self.https.as_deref(),
            _ => None,
        }
    }
}

/// `*` matches any run of characters; everything else literally (both lowercase).
pub(super) fn glob(pattern: &str, text: &str) -> bool {
    let (p, t) = (pattern.as_bytes(), text.as_bytes());
    let (mut pi, mut ti) = (0usize, 0usize);
    let mut star: Option<(usize, usize)> = None;
    while ti < t.len() {
        if pi < p.len() && p[pi] == b'*' {
            star = Some((pi, ti));
            pi += 1;
        } else if pi < p.len() && p[pi] == t[ti] {
            pi += 1;
            ti += 1;
        } else if let Some((sp, st)) = star {
            pi = sp + 1;
            ti = st + 1;
            star = Some((sp, st + 1));
        } else {
            return false;
        }
    }
    p[pi..].iter().all(|&c| c == b'*')
}
