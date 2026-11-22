//! The Windows system proxy (Internet Settings), read by us (PLAN 4.7): hyper-util copies a
//! per-protocol `ProxyServer` value verbatim and fails to parse it, so requests would go direct.
//! Elsewhere the system proxy is reqwest's own (the proxy environment variables on Linux).

use super::proxy_plan::ProxyPlan;

/// The proxy Windows is set to use, or None (no proxy, or not Windows).
#[cfg(windows)]
pub fn system_plan() -> Option<ProxyPlan> {
    let key = winreg::HKCU
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Internet Settings")
        .ok()?;
    let enabled: u32 = key.get_value("ProxyEnable").unwrap_or(0);
    if enabled == 0 {
        return None;
    }
    let server: String = key.get_value("ProxyServer").ok()?;
    let overrides: String = key.get_value("ProxyOverride").unwrap_or_default();
    let plan = ProxyPlan::from_windows(&server, &overrides);
    (plan.http.is_some() || plan.https.is_some()).then_some(plan)
}

#[cfg(not(windows))]
pub fn system_plan() -> Option<ProxyPlan> {
    None
}

/// What the connection test says about the system proxy here.
pub fn system_note() -> &'static str {
    if cfg!(windows) {
        "Windows proxy settings (a PAC script or automatic detection is not used)."
    } else {
        "The proxy environment variables (HTTPS_PROXY, HTTP_PROXY, NO_PROXY); GNOME and KDE \
         proxy settings are not read."
    }
}
