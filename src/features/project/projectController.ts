import { createEmptyDocument } from "@/core/schema"
import type { PendingProject } from "@/lib/tauri/project"
import type { Result } from "@/lib/tauri/result"
import type { ProjectState } from "@/store/session/projectStore"
import { openPending, type Settled } from "./openFlow"
import type { ProjectDeps } from "./projectDeps"
import { saveDocument } from "./saveFlow"
import { switchDocument } from "./switchDocument"

/**
 * File › New, Open, Open Recent, Save, Save As, Close, and closing the window (PLAN 5.3), plus
 * launch files and crash recovery (5.4, 5.5). One project operation runs at a time; anything
 * that would replace a document with unsaved changes asks first (Save / Don't Save / Cancel).
 */
export function createProjectController(deps: ProjectDeps) {
  const { backend, notify, project } = deps
  /** A launch file arrived during another operation: Rust keeps it, we take it after. */
  let launchWaiting = false
  /** The window was closed during another operation: the close runs after it. */
  let closeWaiting = false

  /** Runs `op` unless another project operation or an import is running. */
  async function exclusive(busy: NonNullable<ProjectState["busy"]>, op: () => Promise<unknown>) {
    if (project.getState().busy !== null) return
    if (deps.imports.getState().status.phase === "running") {
      notify.info("An import is running", "Wait for it to finish, or cancel it, first.")
      return
    }
    project.getState().setBusy(busy) // also holds off new autosaves
    try {
      await deps.autosaveIdle()
      await op()
    } finally {
      project.getState().setBusy(null)
    }
    if (closeWaiting) {
      closeWaiting = false
      await close()
    } else if (launchWaiting) {
      launchWaiting = false
      await openLaunch()
    }
  }

  function openLaunch(): Promise<void> {
    if (project.getState().busy !== null) {
      launchWaiting = true
      return Promise.resolve()
    }
    return exclusive("opening", () => open("Open", backend.openLaunchProject()))
  }

  /**
   * Unsaved changes are saved or discarded by choice. Asks again when edits were made while
   * saving, so none are dropped without asking.
   */
  async function settle(action: string): Promise<Settled> {
    let saved = false
    while (project.getState().dirty) {
      const choice = await project.getState().ask(action)
      if (choice === "cancel") return "cancelled"
      if (choice === "discard") {
        await backend.clearAutosave() // Don't Save: nothing to recover later
        return "proceed"
      }
      const busy = project.getState().busy
      project.getState().setBusy("saving")
      try {
        if (!(await saveDocument(deps))) return "cancelled"
      } finally {
        project.getState().setBusy(busy)
      }
      saved = true
    }
    return saved ? "saved" : "proceed"
  }

  const close = () =>
    exclusive("closing", async () => {
      if ((await settle("closing StudioVD")) !== "cancelled") await backend.confirmClose()
    })

  async function open(origin: string, pending: Promise<Result<PendingProject | null>>) {
    const result = await pending
    if (!result.ok) notify.error(`${origin} failed`, result.error.message)
    else if (result.value) await openPending(deps, result.value, settle)
  }

  async function newProject() {
    if ((await settle("starting a new project")) === "cancelled") return
    const created = await backend.newProject()
    if (!created.ok) {
      notify.error("New project failed", created.error.message)
      return
    }
    switchDocument(deps, createEmptyDocument(deps.appVersion), true)
    project.getState().switched(created.value.fileName)
  }

  return {
    newProject: () => exclusive("creating", newProject),
    open: () => exclusive("opening", () => open("Open", backend.openProjectDialog())),
    openRecent: (id: string) =>
      exclusive("opening", () => open("Open", backend.openRecentProject(id))),
    /** A `.stvd` from the command line, a second launch or a drop (after any busy work). */
    openLaunch,
    save: () => exclusive("saving", () => saveDocument(deps)),
    saveAs: () => exclusive("saving", () => saveDocument(deps, true)),
    /**
     * The window's close button or File › Exit, with unsaved changes (Rust held it). Ignored
     * while a question is open or a close is already running; held during other operations.
     */
    async requestClose() {
      await backend.acknowledgeClose()
      const { prompt, busy } = project.getState()
      if (prompt !== null || busy === "closing") return
      if (busy !== null) closeWaiting = true
      else await close()
    },
    restore: (token: string) =>
      exclusive("opening", async () => {
        project.getState().setRecovery([])
        await open("Restore", backend.restoreRecovery(token))
      }),
    async discardRecovered(token: string) {
      const discarded = await backend.discardRecovery(token)
      if (!discarded.ok) notify.error("Discard failed", discarded.error.message)
      project.getState().setRecovery(project.getState().recovery.filter((c) => c.token !== token))
    },
  }
}

export type ProjectController = ReturnType<typeof createProjectController>
