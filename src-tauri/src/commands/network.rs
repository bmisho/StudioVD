//! Settings › Network (PLAN 4.7, 14.4): offline mode, consent, proxy, extra CA, mirror, and a
//! connection test that says precisely what failed. The CA file is chosen in a Rust dialog.

use super::ipc::{blocking, into_path};
use super::online::{client, hosts, load_settings, update_settings, CA_FILE, MAX_CA_BYTES};
use crate::error::{AppError, AppResult};
use crate::fsutil::write_atomic;
use crate::library::online::request::{get_small, host_of};
use crate::library::online::signed::MAX_SIGNATURE_BYTES;
use crate::library::online::source::OFFICIAL;
use crate::net::client::{parse_ca, plan_for};
use crate::net::settings::{NetworkSettings, ProxySetting};
use crate::net::winproxy::system_note;
use crate::picked::read_capped;
use crate::state::AppState;
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, Window};
use tauri_plugin_dialog::DialogExt;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkView {
    pub settings: NetworkSettings,
    /// The hosts network use reaches (named by the consent dialog).
    pub hosts: Vec<String>,
    /// Where the system proxy comes from on this platform.
    pub system_proxy: &'static str,
    /// The proxy the settings resolve to right now, as text.
    pub proxy_in_use: String,
}

fn view(settings: NetworkSettings) -> NetworkView {
    let proxy_in_use = match plan_for(&settings.proxy) {
        Some(plan) => match (&plan.http, &plan.https) {
            (_, Some(https)) => format!("{https} for https"),
            (Some(http), None) => format!("{http} for http only"),
            (None, None) => "none (direct connections)".into(),
        },
        None if settings.proxy == ProxySetting::System => system_note().into(),
        None => "none (direct connections)".into(),
    };
    NetworkView {
        hosts: hosts(&settings),
        settings,
        system_proxy: system_note(),
        proxy_in_use,
    }
}

#[tauri::command]
pub async fn network_settings<R: Runtime>(app: AppHandle<R>) -> AppResult<NetworkView> {
    blocking(move || Ok(view(load_settings(&app)?))).await
}

/// Saves what the webview may set; the CA name and the last check stay as Rust keeps them.
#[tauri::command]
pub async fn network_save<R: Runtime>(
    app: AppHandle<R>,
    settings: NetworkSettings,
) -> AppResult<NetworkView> {
    let checked = settings.checked()?;
    blocking(move || {
        let saved = update_settings(&app, |s| {
            *s = NetworkSettings {
                last_check: s.last_check,
                extra_ca: s.extra_ca.take(),
                ..checked
            }
        })?;
        Ok(view(saved))
    })
    .await
}

/// Choose an extra trusted CA (PEM) in a dialog; it is checked, copied, then trusted
/// alongside the OS store. `None` when cancelled.
#[tauri::command]
pub async fn network_pick_ca<R: Runtime>(
    window: Window<R>,
    app: AppHandle<R>,
) -> AppResult<Option<NetworkView>> {
    let Some(file) = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("Trust an extra certificate authority")
        .add_filter(
            "PEM certificates",
            &["pem", "crt", "cer", "PEM", "CRT", "CER"],
        )
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = into_path(file)?;
    blocking(move || {
        let pem = read_capped(&path, MAX_CA_BYTES)?;
        let count = parse_ca(&pem)?.len();
        {
            let state = app.state::<AppState>();
            let (dest, _guard) = state.network_file(CA_FILE)?;
            write_atomic(&dest, &pem)?;
        }
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().chars().take(120).collect::<String>())
            .unwrap_or_default();
        let label = format!(
            "{name} ({count} certificate{})",
            if count == 1 { "" } else { "s" }
        );
        Ok(Some(view(update_settings(&app, |s| {
            s.extra_ca = Some(label)
        })?)))
    })
    .await
}

#[tauri::command]
pub async fn network_clear_ca<R: Runtime>(app: AppHandle<R>) -> AppResult<NetworkView> {
    blocking(move || {
        {
            let state = app.state::<AppState>();
            let (path, _guard) = state.network_file(CA_FILE)?;
            let _ = std::fs::remove_file(path);
        }
        Ok(view(update_settings(&app, |s| s.extra_ca = None)?))
    })
    .await
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostCheck {
    pub host: String,
    pub ok: bool,
    pub message: String,
}

/// The connection test: each catalog host's signature file (a few hundred bytes).
#[tauri::command]
pub async fn network_test<R: Runtime>(app: AppHandle<R>) -> AppResult<Vec<HostCheck>> {
    let settings = load_settings(&app)?;
    let urls = OFFICIAL.index_urls(settings.mirror.as_deref());
    if urls.is_empty() {
        return Err(AppError::InvalidInput(
            "This build has no catalog host to test; set a mirror to test one.".into(),
        ));
    }
    let client = client(&app, &settings)?;
    let cancel = CancellationToken::new();
    let mut out = Vec::new();
    for url in urls {
        let host = host_of(&url);
        let got = get_small(
            &client,
            &format!("{url}.minisig"),
            MAX_SIGNATURE_BYTES,
            &cancel,
        )
        .await;
        out.push(match got {
            Ok(_) => HostCheck {
                message: format!("{host} answered; the catalog can be downloaded."),
                host,
                ok: true,
            },
            Err(e) => HostCheck {
                host,
                ok: false,
                message: e.to_string(),
            },
        });
    }
    Ok(out)
}
