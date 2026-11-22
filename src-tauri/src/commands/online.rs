//! What the catalog and network commands share: the settings as saved, the client they ask
//! for, and the rule that nothing goes out offline or before the user agreed (PLAN 4.7).

use crate::error::{AppError, AppResult};
use crate::library::online::source::OFFICIAL;
use crate::net::client::{build, ClientConfig};
use crate::net::settings::NetworkSettings;
use crate::picked::read_capped;
use crate::state::AppState;
use reqwest::Client;
use tauri::{AppHandle, Manager, Runtime};

pub const SETTINGS_FILE: &str = "network.json";
pub const CA_FILE: &str = "network-ca.pem";
pub const MAX_CA_BYTES: u64 = 1024 * 1024;

pub fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn load_settings<R: Runtime>(app: &AppHandle<R>) -> AppResult<NetworkSettings> {
    let state = app.state::<AppState>();
    let (path, _guard) = state.network_file(SETTINGS_FILE)?;
    Ok(NetworkSettings::load(&path))
}

/// Applies `change` to the saved settings and saves them.
pub fn update_settings<R: Runtime>(
    app: &AppHandle<R>,
    change: impl FnOnce(&mut NetworkSettings),
) -> AppResult<NetworkSettings> {
    let state = app.state::<AppState>();
    let (path, _guard) = state.network_file(SETTINGS_FILE)?;
    let mut settings = NetworkSettings::load(&path);
    change(&mut settings);
    settings.save(&path)?;
    Ok(settings)
}

/// The client for an explicit network action: refused offline and before consent.
pub fn client<R: Runtime>(app: &AppHandle<R>, settings: &NetworkSettings) -> AppResult<Client> {
    if settings.offline {
        return Err(AppError::Network(
            "Offline mode is on (Settings › Network).".into(),
        ));
    }
    if !settings.consented {
        return Err(AppError::InvalidInput(
            "Allow StudioVD to use the network first.".into(),
        ));
    }
    let ca = match settings.extra_ca {
        Some(_) => {
            let state = app.state::<AppState>();
            let (path, _guard) = state.network_file(CA_FILE)?;
            Some(read_capped(&path, MAX_CA_BYTES)?)
        }
        None => None,
    };
    build(&ClientConfig {
        settings,
        extra_ca_pem: ca.as_deref(),
        allow_http: false,
    })
}

/// The hosts the consent dialog names for these settings.
pub fn hosts(settings: &NetworkSettings) -> Vec<String> {
    OFFICIAL.hosts(settings.mirror.as_deref())
}
