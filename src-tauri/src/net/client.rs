//! The one HTTP client the app has (PLAN 4.7): reqwest with rustls, the OS trust store
//! (rustls-platform-verifier) plus an optional extra CA, our proxy plan, https only, no
//! decompression (Range offsets are raw bytes), a few redirects at most.

use super::proxy_plan::ProxyPlan;
use super::settings::{NetworkSettings, ProxySetting};
use super::winproxy;
use crate::error::{AppError, AppResult};
use reqwest::{redirect, Certificate, Client, Proxy};
use std::time::Duration;

pub const MAX_REDIRECTS: usize = 5;

/// How the client is built: the user's settings, an extra CA (PEM) and, in tests only, plain
/// `http://` to a local mock server.
pub struct ClientConfig<'a> {
    pub settings: &'a NetworkSettings,
    pub extra_ca_pem: Option<&'a [u8]>,
    pub allow_http: bool,
}

/// The certificates of a PEM bundle (at least one), for the extra CA setting.
pub fn parse_ca(pem: &[u8]) -> AppResult<Vec<Certificate>> {
    let certs = Certificate::from_pem_bundle(pem)
        .map_err(|_| AppError::InvalidInput("The file is not a PEM certificate.".into()))?;
    if certs.is_empty() {
        return Err(AppError::InvalidInput(
            "The file holds no PEM certificate.".into(),
        ));
    }
    Ok(certs)
}

/// The proxy plan the settings ask for: None to use reqwest's own system proxy.
pub fn plan_for(proxy: &ProxySetting) -> Option<ProxyPlan> {
    match proxy {
        ProxySetting::System => winproxy::system_plan(),
        ProxySetting::None => Some(ProxyPlan::default()),
        ProxySetting::Manual { url, bypass } => ProxyPlan::manual(url, bypass),
    }
}

pub fn build(config: &ClientConfig) -> AppResult<Client> {
    if config.settings.offline {
        return Err(AppError::Network(
            "Offline mode is on (Settings › Network).".into(),
        ));
    }
    // reqwest is built without a default crypto provider (no aws-lc-rs); an Err only says one
    // is installed already.
    let _ = rustls::crypto::ring::default_provider().install_default();
    let allow_http = config.allow_http;
    let mut builder = Client::builder()
        .user_agent(concat!("StudioVD/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(30))
        .https_only(!allow_http)
        .redirect(redirect::Policy::custom(move |attempt| {
            if attempt.previous().len() >= MAX_REDIRECTS {
                attempt.error("too many redirects")
            } else if attempt.url().scheme() != "https" && !allow_http {
                attempt.error("redirected away from https")
            } else {
                attempt.follow()
            }
        }));
    let windows_system = cfg!(windows) && config.settings.proxy == ProxySetting::System;
    match plan_for(&config.settings.proxy) {
        Some(plan) if plan.http.is_some() || plan.https.is_some() => {
            builder = builder.no_proxy().proxy(Proxy::custom(move |url| {
                plan.proxy_for(url).map(str::to_owned)
            }));
        }
        Some(_) => builder = builder.no_proxy(),
        // Windows without a proxy set: keep hyper-util away from the registry too.
        None if windows_system => builder = builder.no_proxy(),
        None => {}
    }
    if let Some(pem) = config.extra_ca_pem {
        builder = builder.tls_certs_merge(parse_ca(pem)?);
    }
    builder
        .build()
        .map_err(|e| AppError::Network(format!("The connection could not be set up ({e}).")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn offline_mode_builds_no_client() {
        let settings = NetworkSettings {
            offline: true,
            ..NetworkSettings::default()
        };
        let config = ClientConfig {
            settings: &settings,
            extra_ca_pem: None,
            allow_http: false,
        };
        assert_eq!(build(&config).map(|_| ()).unwrap_err().kind(), "network");
    }

    #[test]
    fn builds_with_each_proxy_mode() {
        for proxy in [
            ProxySetting::System,
            ProxySetting::None,
            ProxySetting::Manual {
                url: "proxy:3128".into(),
                bypass: "<local>".into(),
            },
        ] {
            let settings = NetworkSettings {
                proxy,
                ..NetworkSettings::default()
            };
            let config = ClientConfig {
                settings: &settings,
                extra_ca_pem: None,
                allow_http: false,
            };
            assert!(build(&config).is_ok());
        }
    }

    #[test]
    fn an_extra_ca_must_be_pem() {
        assert!(parse_ca(b"not a certificate").is_err());
        assert!(parse_ca(b"").is_err());
    }
}
