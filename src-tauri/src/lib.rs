mod commands;
mod error;
mod picked;
mod state;
mod workspace;

use tauri::{DragDropEvent, Manager, RunEvent, WebviewEvent, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        // The dialog plugin is used from Rust only; no capability exposes it to the webview.
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let state = state::AppState::new(app.handle());
            app.manage(state);
            Ok(())
        })
        // A window created from the config reports drops on its webview as a WINDOW event
        // (tauri-runtime-wry synthesizes it); only child webviews send webview events.
        .on_window_event(|window, event| {
            if let WindowEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
                commands::import::files_dropped(window, paths);
            }
        })
        .on_webview_event(|webview, event| {
            if let WebviewEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
                commands::import::files_dropped(webview, paths);
            }
        })
        // Workspace assets for the webview (`stvd://localhost/<sha256>.glb`).
        .register_asynchronous_uri_scheme_protocol(
            workspace::protocol::ASSET_SCHEME,
            |ctx, request, responder| {
                let app = ctx.app_handle().clone();
                let path = request.uri().path().to_owned();
                tauri::async_runtime::spawn_blocking(move || {
                    let state = app.try_state::<state::AppState>();
                    let dir = state.and_then(|s| s.workspace().ok().map(|w| w.geometry_dir()));
                    let (status, body) = workspace::protocol::asset_reply(dir.as_deref(), &path);
                    responder.respond(workspace::protocol::asset_response(status, body));
                });
            },
        )
        .invoke_handler(tauri::generate_handler![
            commands::app::app_info,
            commands::project::project_new,
            commands::project::project_open,
            commands::project::project_save,
            commands::project::project_save_as,
            commands::import::pick_import_files,
            commands::import::read_import_file,
            commands::import::read_import_resource,
            commands::assets::write_asset,
            commands::export::pick_export_path,
            commands::export::write_export,
        ])
        .build(tauri::generate_context!());
    match app {
        Ok(app) => app.run(|handle, event| {
            if let RunEvent::Exit = event {
                handle.state::<state::AppState>().remove_workspace();
            }
        }),
        Err(e) => {
            eprintln!("StudioVD failed to start: {e}");
            std::process::exit(1);
        }
    }
}
