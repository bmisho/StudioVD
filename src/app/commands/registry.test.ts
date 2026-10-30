import { describe, expect, it, vi } from "vitest"
import { buildShortcutMap } from "@/app/shortcuts/useGlobalShortcuts"
import type { Result } from "@/lib/tauri/result"
import type { AnchorId, GroupId } from "@/core/schema"
import { notImplemented, setupRegistry as setup } from "./registryTestSetup"

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

  it("New Group wraps the selection in a numbered group and selects it", () => {
    const { registry, document, session } = setup()
    registry.run("edit.newGroup") // nothing selected: an empty group at the root
    registry.run("edit.newGroup") // Group 1 selected: wrapped by Group 2
    const groups = Object.values(document.getState().doc.groups)
    expect(groups.map((g) => g.name)).toEqual(["Group 1", "Group 2"])
    const [first, second] = groups
    expect(second?.parentId).toBeNull()
    expect(first?.parentId).toBe(second?.id)
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

  it("Mate: on outside test mode; Escape drops its picks, then ends it", () => {
    const { registry, session } = setup()
    expect(registry.run("tool.mate")).toBe(true)
    const anchorA = "a" as AnchorId
    session
      .getState()
      .setMateDraft({ anchorA, anchorB: null, type: "revolute", flip: false, angleOffsetRad: 0 })
    registry.run("edit.clearSelection")
    expect([session.getState().activeTool, session.getState().mateDraft]).toEqual(["mate", null])
    registry.run("edit.clearSelection")
    expect(session.getState().activeTool).toBe("select")
    session.getState().toggleTestMode()
    expect(registry.isEnabled("tool.mate")).toBe(false)
    expect(registry.get("tool.mate").disabledReason).toBe("leave test mode first")
  })

  it("Place Anchor: on outside test mode; Escape ends it before it clears the selection", () => {
    const { registry, session } = setup()
    session.getState().select([{ kind: "group", id: "g" as GroupId }])
    expect(registry.run("tool.anchor")).toBe(true)
    expect(session.getState().activeTool).toBe("anchor")
    registry.run("edit.clearSelection")
    expect(session.getState().activeTool).toBe("select")
    expect(session.getState().selection).toHaveLength(1) // what the tool made stays selected
    registry.run("edit.clearSelection")
    expect(session.getState().selection).toHaveLength(0)
    registry.run("tool.anchor")
    session.getState().toggleTestMode()
    expect(session.getState().activeTool).toBe("select") // tools edit the design pose
    expect(registry.isEnabled("tool.anchor")).toBe(false)
    expect(registry.get("tool.anchor").disabledReason).toBe("leave test mode first")
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

describe("3D view commands", () => {
  it("are disabled until a viewport attaches, then drive it", () => {
    const { registry, viewport } = setup()
    expect(registry.get("view.fitAll").shortcuts).toEqual(["F", "Home"])
    expect(registry.isEnabled("view.fitAll")).toBe(false)
    expect(registry.isEnabled("view.orient.top")).toBe(false)

    const impl = {
      fitAll: vi.fn(),
      fitAllNextFrame: vi.fn(),
      setView: vi.fn(),
      captureThumbnail: vi.fn(),
      partAt: vi.fn(() => null),
      probe: vi.fn(() => null),
      toClient: vi.fn(() => null),
      centre: vi.fn(() => null),
      renderMaterialPreviews: vi.fn(() => Promise.resolve(null)),
    }
    const detach = viewport.attach(impl)
    expect(registry.run("view.fitAll")).toBe(true)
    expect(impl.fitAll).toHaveBeenCalledOnce()
    registry.run("view.orient.top")
    expect(impl.setView).toHaveBeenCalledWith([0, 1, 0], expect.any(Boolean))

    detach()
    expect(registry.isEnabled("view.fitAll")).toBe(false)
  })

  it("binds standard views to Ctrl+1..7", () => {
    const { registry } = setup()
    const views = ["front", "back", "left", "right", "top", "bottom", "isometric"] as const
    views.forEach((v, i) => {
      expect(registry.get(`view.orient.${v}`).shortcuts).toEqual([`Ctrl+${i + 1}`])
    })
  })

  it("switches the mouse navigation preset as a radio group", () => {
    const { registry, preferences } = setup()
    expect(registry.get("view.navigation.solidworks").isChecked?.()).toBe(true)
    registry.run("view.navigation.onshape")
    expect(preferences.getState().navigationPreset).toBe("onshape")
    const checked = registry.list.filter(
      (c) => c.id.startsWith("view.navigation.") && c.isChecked?.()
    )
    expect(checked.map((c) => c.id)).toEqual(["view.navigation.onshape"])
  })

  it("switches the display style as a radio group, shaded by default", () => {
    const { registry, session } = setup()
    expect(registry.get("view.display.shaded").isChecked?.()).toBe(true)
    registry.run("view.display.xray")
    expect(session.getState().displayMode).toBe("xray")
    const checked = registry.list.filter((c) => c.id.startsWith("view.display.") && c.isChecked?.())
    expect(checked.map((c) => c.id)).toEqual(["view.display.xray"])
  })
})
