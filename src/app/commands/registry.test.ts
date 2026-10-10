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

function setup() {
  const document = createDocumentStore()
  const session = createSessionStore()
  const reportError = vi.fn<(e: AppError) => void>()
  const openDialog = vi.fn()
  const backend: Backend = {
    newProject: vi.fn(() => Promise.resolve(notImplemented)),
    openProject: vi.fn(() => Promise.resolve(notImplemented)),
    saveProject: vi.fn(() => Promise.resolve(notImplemented)),
    saveProjectAs: vi.fn(() => Promise.resolve(notImplemented)),
    importFiles: vi.fn(() => Promise.resolve(notImplemented)),
    exportScene: vi.fn(() => Promise.resolve(notImplemented)),
    closeWindow: vi.fn(() => Promise.resolve({ ok: true as const, value: undefined })),
  }
  const history = createHistory(document)
  const registry = createCommandRegistry({
    document,
    history,
    session,
    backend,
    reportError,
    openDialog,
  })
  return { registry, document, session, backend, reportError, openDialog, history }
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
    await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith(notImplemented.error))
    expect(backend.saveProject).toHaveBeenCalledOnce()
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

  it("keeps not-yet-built commands visibly disabled", () => {
    const { registry } = setup()
    expect(registry.isEnabled("view.fitAll")).toBe(false)
    expect(registry.get("view.fitAll").availableInPhase).toBe(3)
  })

  it("toggles view state and opens the about dialog", () => {
    const { registry, session, openDialog } = setup()
    registry.run("view.toggleProjection")
    expect(registry.get("view.toggleProjection").isChecked?.()).toBe(true)
    registry.run("tool.anchor")
    expect(session.getState().activeTool).toBe("anchor")
    registry.run("edit.clearSelection")
    expect(session.getState().activeTool).toBe("select")
    registry.run("help.about")
    expect(openDialog).toHaveBeenCalledWith("about")
  })
})
