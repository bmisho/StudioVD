// Test helper for the project controller tests (not app code): real stores, a fake backend
// that keeps "files" in memory, the way the E2E Tauri mock does.
import { vi } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import type { PendingProject, ProjectInfo } from "@/lib/tauri/project"
import { ok, type Result } from "@/lib/tauri/result"
import { createDocumentStore } from "@/store/document/documentStore"
import { createHistory } from "@/store/document/history"
import { createImportStore } from "@/store/session/importStore"
import { createProjectStore } from "@/store/session/projectStore"
import { createSessionStore } from "@/store/session/sessionStore"
import { createDirtyTracker } from "./dirtyTracker"
import { createProjectController } from "./projectController"
import type { ProjectBackend } from "./projectDeps"

export function setupProject() {
  const document = createDocumentStore()
  const history = createHistory(document)
  const session = createSessionStore()
  const imports = createImportStore()
  const project = createProjectStore()
  const tracker = createDirtyTracker(document, project, vi.fn())
  /** Saved files: name → scene.json bytes. Every asset file is assumed present. */
  const disk = new Map<string, Uint8Array>()
  let current: string | null = null
  let pending: { name: string | null; scene: Uint8Array; recovered: boolean } | null = null
  const nextPick = { name: "robot.stvd" as string | null }
  const info = (): Result<ProjectInfo> => ok({ fileName: current })
  const pendingInfo = (): PendingProject => {
    const doc = JSON.parse(new TextDecoder().decode(pending?.scene)) as {
      assets: Record<string, { path: string }>
    }
    return {
      fileName: pending?.name ?? null,
      files: Object.values(doc.assets).map((a) => a.path),
      recovered: pending?.recovered ?? false,
    }
  }
  const backend = {
    newProject: vi.fn(() => {
      current = null
      return Promise.resolve(info())
    }),
    openProjectDialog: vi.fn(() => {
      const name = nextPick.name
      const scene = name === null ? undefined : disk.get(name)
      if (name === null || !scene) return Promise.resolve(ok(null))
      pending = { name, scene, recovered: false }
      return Promise.resolve(ok(pendingInfo()))
    }),
    openRecentProject: vi.fn(),
    openLaunchProject: vi.fn(() => Promise.resolve(ok(null))),
    pendingScene: vi.fn(() => Promise.resolve(ok(pending?.scene.slice().buffer as ArrayBuffer))),
    commitProject: vi.fn(() => {
      current = pending?.name ?? null
      pending = null
      return Promise.resolve(info())
    }),
    discardProject: vi.fn(() => {
      pending = null
      return Promise.resolve(ok(undefined))
    }),
    pickProjectPath: vi.fn(() =>
      Promise.resolve(
        ok(nextPick.name ? { token: nextPick.name, name: nextPick.name, size: 0 } : null)
      )
    ),
    saveProject: vi.fn((scene: Uint8Array, _thumbnail: Uint8Array | null, token?: string) => {
      const name = token ?? current
      if (!name) throw new Error("save without a file")
      disk.set(name, scene)
      current = name
      return Promise.resolve(info())
    }),
    clearAutosave: vi.fn(() => Promise.resolve(ok(undefined))),
    acknowledgeClose: vi.fn(() => Promise.resolve(ok(undefined))),
    confirmClose: vi.fn(() => Promise.resolve(ok(undefined))),
    restoreRecovery: vi.fn(),
    discardRecovery: vi.fn(),
  } satisfies ProjectBackend
  const notify = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() }
  const controller = createProjectController({
    backend,
    document,
    history,
    session,
    imports,
    project,
    tracker,
    retainAssets: vi.fn(),
    fitAll: vi.fn(),
    captureThumbnail: () => Promise.resolve(null),
    autosaveIdle: () => Promise.resolve(),
    notify,
    appVersion: "0.1.0",
    now: () => 1000,
  })
  const insertRig = () => document.getState().insertEntities(createTestRig())
  /** Answers the next unsaved-changes prompt as soon as it opens. */
  const answerNext = (choice: "save" | "discard" | "cancel") => {
    const unsubscribe = project.subscribe((s) => {
      if (!s.prompt) return
      unsubscribe()
      s.prompt.answer(choice)
    })
  }
  return {
    document,
    history,
    session,
    imports,
    project,
    backend,
    notify,
    disk,
    controller,
    nextPick,
    insertRig,
    answerNext,
  }
}
