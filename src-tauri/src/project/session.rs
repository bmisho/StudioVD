//! Session boundaries: a reload of the main page, and retiring a workspace that is no
//! longer the project's.

use super::window::update_title;
use crate::error::AppResult;
use crate::state::AppState;
use crate::workspace::Workspace;
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{AppHandle, Manager, Runtime};

static PAGE_LOADS: AtomicU32 = AtomicU32::new(0);

/// Done with `ws`. With `keep_unsaved`, an autosave keeps it for crash recovery (unlocked
/// now, so it is offered right away); otherwise, or without one, it is deleted in the
/// background. New and Open pass false: the user already saved or discarded the changes.
pub fn retire(ws: Workspace, keep_unsaved: bool) {
    if keep_unsaved && ws.autosave_path().is_file() {
        drop(ws);
    } else {
        std::thread::spawn(move || ws.discard());
    }
}

/// The main page started loading. The first load is the app starting; any later one (F5,
/// a reload from the context menu, a dev-server reload) brings up an empty document, so
/// Rust starts a fresh untitled session too: the old one's file must not be saved over
/// with the new page's document, and its unsaved work is offered for recovery.
pub fn page_started<R: Runtime>(app: &AppHandle<R>) {
    if PAGE_LOADS.fetch_add(1, Ordering::SeqCst) == 0 {
        return;
    }
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    if let Err(e) = restart(&state) {
        eprintln!("StudioVD: could not start a new session after a reload ({e}).");
    }
    let project = state.project();
    if let Ok(project) = project {
        update_title(app, &project);
    }
}

fn restart(state: &AppState) -> AppResult<()> {
    let fresh = Workspace::create(state.workspaces_dir()?)?;
    let (old, pending) = state.project()?.restart(fresh);
    if let Some(pending) = pending {
        retire(pending.workspace, true);
    }
    if let Some(old) = old {
        retire(old, true);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::{Pending, Project};
    use std::fs;
    use std::time::{Duration, Instant};

    fn gone_soon(path: &std::path::Path) -> bool {
        let deadline = Instant::now() + Duration::from_secs(5);
        while path.exists() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        !path.exists()
    }

    #[test]
    fn retiring_keeps_unsaved_work_only_when_asked() {
        let base = std::env::temp_dir().join(format!("studiovd-retire-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let reloaded = Workspace::create(&base).expect("workspace");
        fs::write(reloaded.autosave_path(), b"{}").expect("autosave");
        let kept = reloaded.root().to_path_buf();
        retire(reloaded, true); // a page reload: offered for recovery
        assert!(kept.join("autosave.json").is_file());
        assert!(
            Workspace::adopt(&kept).is_ok(),
            "unlocked, so recovery can take it"
        );

        let replaced = Workspace::create(&base).expect("workspace");
        fs::write(replaced.autosave_path(), b"{}").expect("late autosave");
        let root = replaced.root().to_path_buf();
        retire(replaced, false); // New/Open after the user saved or discarded
        assert!(gone_soon(&root), "a stale autosave does not keep it");
        let _ = fs::remove_dir_all(base);
    }

    #[test]
    fn a_reload_forgets_the_file_so_saving_cannot_overwrite_it() {
        let base = std::env::temp_dir().join(format!("studiovd-restart-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let ws = |_| Workspace::create(&base).expect("workspace");
        let mut project = Project {
            workspace: Some(ws(0)),
            path: Some("/projects/robot.stvd".into()),
            dirty: true,
            busy: true,
            close_when_idle: true,
            pending: Some(Pending {
                workspace: ws(1),
                path: None,
                scene: "scene.json".into(),
            }),
            recovery: vec![("token".into(), "/somewhere".into())],
            ..Project::default()
        };
        let before = project.generation;
        let (old, pending) = project.restart(ws(2));
        assert!(
            old.is_some() && pending.is_some(),
            "both retired by the caller"
        );
        assert_eq!(project.info().file_name, None);
        assert!(!project.dirty && !project.busy && !project.close_when_idle);
        assert!(project.pending.is_none() && project.recovery.is_empty());
        assert_eq!(
            project.generation,
            before + 1,
            "the old page's save is ignored"
        );
        drop((old, pending, project));
        let _ = fs::remove_dir_all(base);
    }
}
