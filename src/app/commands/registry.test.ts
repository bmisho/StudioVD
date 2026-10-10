import { describe, expect, it, vi } from "vitest"
import { buildShortcutMap } from "@/app/shortcuts/useGlobalShortcuts"
import type { AppError, Result } from "@/lib/tauri/result"
import { createDocumentStore } from "@/store/document/documentStore"
import { createHistory } from "@/store/document/history"
import { createSessionStore } from "@/store/session/sessionStore"
import { createCommandRegistry } from "./registry"
import type { Backend } from "./types"

const notImplemented: Result<void> = {
  ok: false,
  error: { kind: "notImplemented", message: "Saving projects arrives in Phase 5." },
}

function setup(overrides: Partial<Backend> = {}) {
  const document = createDocumentStore()
  const session = createSessionStore()
  const reportError = vi.fn<(e: AppError, action: string) => void>()
  const openDialog = vi.fn()
  const focusMenuBar = vi.fn()
  const backend: Backend = {
    newProject: vi.fn(() => Promise.resolve(notImplemented)),
    openProject: vi.fn(() => Promise.resolve(notImplemented)),
    saveProject: vi.fn(() => Promise.resolve(notImplemented)),
    saveProjectAs: vi.fn(() => Promise.resolve(notImplemented)),
    importFiles: vi.fn(() => Promise.resolve(notImplemented)),
    exportScene: vi.fn(() => Promise.resolve(notImplemented)),
    closeWindow: vi.fn(() => Promise.resolve({ ok: true as const, value: undefined })),
    ...overrides,
  }
  const history = createHistory(document)
  const registry = createCommandRegistry({
    document,
    history,
    session,
    backend,
    reportError,
    openDialog,
    focusMenuBar,
  })
  return { registry, document, session, backend, reportError, openDialog, focusMenuBar, history }
}

describe("command registry", () => {
  it("has unique ids, labels and conflict-free, valid shortcuts", () => {
    const { registry } = setup()
    expect(new Set(registry.list.map((c) => c.id)).size).toBe(registry.list.length)
    for (const c of registry.list) expect(c.label.trim()).not.toBe("")
    expect(() => buildShortcutMap(registry)).not.toThrow()
  })

  it("reports backend failures instead of throwing", async () => {
    const { registry, backend, reportError } = setup()
    registry.run("file.save")
    await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith(notImplemented.error, "Save"))
    expect(backend.saveProject).toHaveBeenCalledOnce()
  })

  it("drops re-entrant runs while a backend call is in flight", async () => {
    let release: (r: Result<void>) => void = () => undefined
    const importFiles = vi.fn(() => new Promise<Result<void>>((r) => (release = r)))
    const { registry } = setup({ importFiles })
    registry.run("file.import")
    registry.run("file.import") // held Ctrl+I / double click
    expect(importFiles).toHaveBeenCalledOnce()
    release({ ok: true, value: undefined })
    await vi.waitFor(() => {
      registry.run("file.import")
      expect(importFiles).toHaveBeenCalledTimes(2)
    })
  })

  it("passes the export format to the backend", async () => {
    const { registry, backend } = setup()
    registry.run("file.exportStl")
    await vi.waitFor(() => expect(backend.exportScene).toHaveBeenCalledWith("stl"))
  })

  it("creates numbered groups, nests under the selected group and selects the new one", () => {
    const { registry, document, session } = setup()
    registry.run("edit.newGroup")
    registry.run("edit.newGroup")
    const groups = Object.values(document.getState().doc.groups)
    expect(groups.map((g) => g.name)).toEqual(["Group 1", "Group 2"])
    const second = groups[1]
    expect(second?.parentId).toBe(groups[0]?.id)
    expect(session.getState().selection).toEqual([{ kind: "group", id: second?.id }])
  })

  it("enables delete only with a group selected, and clears the selection after", () => {
    const { registry, document, session } = setup()
    expect(registry.isEnabled("edit.delete")).toBe(false)
    expect(registry.run("edit.delete")).toBe(false)
    registry.run("edit.newGroup")
    expect(registry.isEnabled("edit.delete")).toBe(true)
    registry.run("edit.delete")
    expect(Object.keys(document.getState().doc.groups)).toHaveLength(0)
    expect(session.getState().selection).toEqual([])
  })

  it("wires undo/redo to history and reflects availability", () => {
    const { registry, document } = setup()
    expect(registry.isEnabled("edit.undo")).toBe(false)
    registry.run("edit.newGroup")
    expect(registry.isEnabled("edit.undo")).toBe(true)
    registry.run("edit.undo")
    expect(Object.keys(document.getState().doc.groups)).toHaveLength(0)
    registry.run("edit.redo")
    expect(Object.keys(document.getState().doc.groups)).toHaveLength(1)
  })

  it("keeps not-yet-built commands visibly disabled, with their phase", () => {
    const { registry, session } = setup()
    for (const [id, phase] of [
      ["view.fitAll", 3],
      ["test.toggle", 3],
      ["tool.anchor", 7],
      ["tool.mate", 8],
    ] as const) {
      expect(registry.isEnabled(id)).toBe(false)
      expect(registry.get(id).availableInPhase).toBe(phase)
    }
    expect(registry.run("tool.anchor")).toBe(false)
    expect(session.getState().activeTool).toBe("select")
  })

  it("marks only undo/redo as auto-repeatable", () => {
    const { registry } = setup()
    const repeatable = registry.list.filter((c) => c.repeatable).map((c) => c.id)
    expect(repeatable).toEqual(["edit.undo", "edit.redo"])
  })

  it("toggles view state, opens the about dialog and focuses the menu bar", () => {
    const { registry, session, openDialog, focusMenuBar } = setup()
    registry.run("view.toggleProjection")
    expect(registry.get("view.toggleProjection").isChecked?.()).toBe(true)
    session.getState().setTool("mate")
    registry.run("edit.clearSelection")
    expect(session.getState().activeTool).toBe("select")
    registry.run("help.about")
    expect(openDialog).toHaveBeenCalledWith("about")
    registry.run("view.focusMenuBar")
    expect(focusMenuBar).toHaveBeenCalledOnce()
  })
})
