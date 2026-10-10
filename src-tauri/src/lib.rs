mod commands;
mod error;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let result = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::app::app_info,
            commands::project::project_new,
            commands::project::project_open,
            commands::project::project_save,
            commands::project::project_save_as,
            commands::project::import_files,
            commands::project::export_scene,
        ])
        .run(tauri::generate_context!());
    if let Err(e) = result {
        eprintln!("StudioVD failed to start: {e}");
        std::process::exit(1);
    }
}
