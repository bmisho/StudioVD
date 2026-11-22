//! The build script. App commands go through Tauri's ACL (PLAN 15.2): each command below gets
//! an `allow-<name>` permission, and only what `capabilities/default.json` grants the main
//! window can be invoked. `src/acl_tests.rs` checks this list against `generate_handler!`.

const COMMANDS: &[&str] = &[
    "app_info",
    "log_webview_error",
    "project_info",
    "project_new",
    "project_open",
    "project_open_recent",
    "project_open_launch",
    "project_pending_scene",
    "project_commit",
    "project_discard",
    "project_pick_save_path",
    "project_save",
    "project_set_dirty",
    "project_close_ack",
    "project_close_confirmed",
    "recent_projects",
    "autosave_write",
    "autosave_clear",
    "recovery_list",
    "recovery_restore",
    "recovery_discard",
    "pick_import_files",
    "read_import_file",
    "read_import_resource",
    "import_texture",
    "write_asset",
    "pick_export_path",
    "write_export",
    "write_export_credits",
    "decompose_mesh",
    "library_list",
    "library_pick_pack",
    "library_install_commit",
    "library_install_cancel",
    "library_remove",
    "library_copy_into_project",
    "library_user_namespace",
    "library_project_geometry_sizes",
    "library_add_from_project",
    "library_export_pack",
    "catalog_status",
    "catalog_refresh",
    "catalog_download",
    "catalog_cancel",
    "library_disk_usage",
    "network_settings",
    "network_save",
    "network_pick_ca",
    "network_clear_ca",
    "network_test",
];

fn main() {
    let manifest = tauri_build::AppManifest::new().commands(COMMANDS);
    if let Err(e) = tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest)) {
        panic!("tauri build failed: {e:#}");
    }
}
