mod bundle;
mod commands;
mod error;
mod fsutil;
mod picked;
mod project;
mod state;
mod workspace;

use tauri::{DragDropEvent, Manager, RunEvent, WebviewEvent, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Managed before any plugin: a second launch can hand over its file during startup.
    let mut builder = tauri::Builder::default().manage(project::launch::LaunchSlot::default());
    if project::launch::single_instance_usable() {
        // First: a second launch hands its arguments over and exits before it creates a
        // window or a workspace (PLAN 5.4).
        builder = builder.plugin(project::launch::single_instance());
    }
    let app = builder
        // The dialog plugin is used from Rust only; no capability exposes it to the webview.
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let state = state::AppState::new(app.handle());
            // A .stvd the app was started with (a double click in the file manager).
            let cwd = std::env::current_dir().unwrap_or_default();
            let launch = project::launch::project_argument(std::env::args_os().skip(1), &cwd);
            if let Some(path) = launch {
                app.state::<project::launch::LaunchSlot>()
                    .put_if_empty(path);
            }
            app.manage(state);
            Ok(())
        })
        // A window created from the config reports drops on its webview as a WINDOW event
        // (tauri-runtime-wry synthesizes it); only child webviews send webview events.
        .on_window_event(|window, event| match event {
            WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) => {
                commands::import::files_dropped(window, paths);
            }
            // Unsaved changes: the webview asks the user first (PLAN 5.3).
            WindowEvent::CloseRequested { api, .. } if !project::window::allow_close(window) => {
                api.prevent_close();
            }
            _ => {}
        })
        // A reload of the page starts a new session (see `project::session`).
        .on_page_load(|webview, payload| {
            if webview.label() == project::window::MAIN_WINDOW
                && payload.event() == tauri::webview::PageLoadEvent::Started
            {
                project::session::page_started(webview.app_handle());
            }
        })
        .on_webview_event(|webview, event| {
            if let WebviewEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
                commands::import::files_dropped(webview, paths);
            }
        })
        // Workspace files for the webview (`stvd://localhost/<sha256>.glb|png|jpg`).
        .register_asynchronous_uri_scheme_protocol(
            workspace::protocol::ASSET_SCHEME,
            |ctx, request, responder| {
                let app = ctx.app_handle().clone();
                let path = request.uri().path().to_owned();
                tauri::async_runtime::spawn_blocking(move || {
                    let state = app.try_state::<state::AppState>();
                    let dir = state.and_then(|s| s.bundle_dir());
                    let (status, mime, body) =
                        workspace::protocol::asset_reply(dir.as_deref(), &path);
                    responder.respond(workspace::protocol::asset_response(status, mime, body));
                });
            },
        )
        .invoke_handler(tauri::generate_handler![
            commands::app::app_info,
            commands::project::project_info,
            commands::project::project_new,
            commands::project::project_open,
            commands::project::project_open_recent,
            commands::project::project_open_launch,
            commands::project::project_pending_scene,
            commands::project::project_commit,
            commands::project::project_discard,
            commands::project::project_pick_save_path,
            commands::project::project_save,
            commands::session::project_set_dirty,
            commands::session::project_close_ack,
            commands::session::project_close_confirmed,
            commands::session::recent_projects,
            commands::session::autosave_write,
            commands::session::autosave_clear,
            commands::session::recovery_list,
            commands::session::recovery_restore,
            commands::session::recovery_discard,
            commands::import::pick_import_files,
            commands::import::read_import_file,
            commands::import::read_import_resource,
            commands::assets::import_texture,
            commands::assets::write_asset,
            commands::export::pick_export_path,
            commands::export::write_export,
        ])
        .build(tauri::generate_context!());
    match app {
        Ok(app) => app.run(|handle, event| {
            if let RunEvent::Exit = event {
                handle.state::<state::AppState>().shutdown();
            }
        }),
        Err(e) => {
            eprintln!("StudioVD failed to start: {e}");
            std::process::exit(1);
        }
    }
}
