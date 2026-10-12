import { isTauri } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import type { PickedFile } from "./files"
import { call } from "./invoke"
import type { Result } from "./result"

// Project commands (src-tauri/src/commands/project.rs, session.rs). Paths stay in Rust:
// the webview sees file names, recent-file ids and recovery tokens (CLAUDE.md §9).

export interface ProjectInfo {
  /** `null` until the project is saved to a file. */
  fileName: string | null
}

/** A bundle extracted and waiting: validate its scene, then commit or discard. */
export interface PendingProject {
  fileName: string | null
  /** Bundle entries (`geometry/<sha256>.glb`, ...). */
  files: string[]
  /** A crashed session's unsaved work. */
  recovered: boolean
}

export interface RecentProject {
  id: string
  name: string
  folder: string
  missing: boolean
}

export interface RecoveryCandidate {
  token: string
  title: string
  fileName: string | null
  autosavedAtMs: number
  sizeBytes: number
}

export const projectInfo = () => call<ProjectInfo>("project_info")
export const newProject = () => call<ProjectInfo>("project_new")
/** Open dialog; `null` when cancelled. */
export const openProjectDialog = () => call<PendingProject | null>("project_open")
export const openRecentProject = (id: string) => call<PendingProject>("project_open_recent", { id })
/** A `.stvd` given on the command line, by a second launch or a drop; `null` if none. */
export const openLaunchProject = () => call<PendingProject | null>("project_open_launch")
export const pendingScene = () => call<ArrayBuffer>("project_pending_scene")
export const commitProject = () => call<ProjectInfo>("project_commit")
export const discardProject = () => call<void>("project_discard")

/** Save As dialog: a write token for `saveProject`, `null` when cancelled. */
export const pickProjectPath = (suggestedName: string): Promise<Result<PickedFile | null>> =>
  call<PickedFile | null>("project_pick_save_path", { suggestedName })

/** Saves scene.json (and a PNG thumbnail) to the project's file, or to `targetToken`'s. */
export function saveProject(
  scene: Uint8Array,
  thumbnail: Uint8Array | null,
  targetToken?: string
): Promise<Result<ProjectInfo>> {
  const body = new Uint8Array(scene.byteLength + (thumbnail?.byteLength ?? 0))
  body.set(scene)
  if (thumbnail) body.set(thumbnail, scene.byteLength)
  const headers: Record<string, string> = { "x-scene-length": String(scene.byteLength) }
  if (targetToken) headers["x-target-token"] = targetToken
  return call<ProjectInfo>("project_save", body, { headers })
}

export const setProjectDirty = (dirty: boolean) => call<void>("project_set_dirty", { dirty })
export const acknowledgeClose = () => call<void>("project_close_ack")
export const confirmClose = () => call<void>("project_close_confirmed")
export const recentProjects = () => call<RecentProject[]>("recent_projects")
export const writeAutosave = (scene: Uint8Array) => call<void>("autosave_write", scene)
export const clearAutosave = () => call<void>("autosave_clear")
export const listRecovery = () => call<RecoveryCandidate[]>("recovery_list")
export const restoreRecovery = (token: string) =>
  call<PendingProject>("recovery_restore", { token })
export const discardRecovery = (token: string) => call<void>("recovery_discard", { token })

const on = async (event: string, handler: () => void): Promise<UnlistenFn> =>
  isTauri() ? listen(event, () => handler()) : () => undefined

/** The user closed the window with unsaved changes (Rust held the close). */
export const onCloseRequested = (handler: () => void) => on("close-requested", handler)
/** A `.stvd` arrived from a second launch or a drop: take it with `openLaunchProject`. */
export const onOpenRequested = (handler: () => void) => on("open-requested", handler)
