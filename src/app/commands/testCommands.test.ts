import { describe, expect, it, vi } from "vitest"
import { setupRegistry as setup } from "./registryTestSetup"

describe("test mode commands", () => {
  it("enter and leave test mode, and reset only while it runs", () => {
    const { registry, session } = setup()
    expect(registry.isEnabled("test.reset")).toBe(false)
    registry.run("test.toggle")
    expect(session.getState().testMode).toBe(true)
    expect(registry.run("test.reset")).toBe(true)
    expect(session.getState().testRun).toBe(1)
    registry.run("test.toggle")
    expect(session.getState().testMode).toBe(false)
    expect(registry.run("test.reset")).toBe(false)
  })

  it("inserts the physics test rig as one undoable change, then frames it", () => {
    const { registry, document, history, viewport } = setup()
    const impl = { fitAll: vi.fn(), fitAllNextFrame: vi.fn(), setView: vi.fn() }
    viewport.attach(impl)
    registry.run("dev.insertTestRig")
    expect(impl.fitAllNextFrame).toHaveBeenCalledOnce()
    const doc = document.getState().doc
    expect(Object.values(doc.parts).map((p) => p.name)).toEqual(["Base", "Leaf"])
    expect(Object.values(doc.mates)).toHaveLength(1)
    history.undo()
    expect(document.getState().doc.parts).toEqual({})
  })
})
