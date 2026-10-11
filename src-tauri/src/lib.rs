mod commands;
mod error;
mod picked;
mod state;
mod workspace;

use tauri::{DragDropEvent, Manager, RunEvent, WebviewEvent};

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
        .on_webview_event(|webview, event| {
            if let WebviewEvent::DragDrop(DragDropEvent::Drop { paths, .. }) = event {
                commands::import::files_dropped(webview, paths);
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::app_info,
            commands::project::project_new,
            commands::project::project_open,
            commands::project::project_save,
            commands::project::project_save_as,
            commands::import::pick_import_files,
            commands::import::read_import_file,
            commands::import::read_import_resource,
            commands::import::write_asset,
            commands::import::workspace_info,
            commands::import::pick_export_path,
            commands::import::write_export,
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
