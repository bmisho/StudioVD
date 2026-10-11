import { describe, expect, it } from "vitest"
import type { PartId } from "@/core/schema"
import { createSessionStore } from "@/store/session/sessionStore"
import { applySelectionChange } from "./applySelectionChange"
import { createViewportMissHandler } from "./viewportMiss"

const part = { kind: "part" as const, id: "p1" as PartId }
const miss = (init: MouseEventInit & { type?: string } = {}) =>
  new MouseEvent(init.type ?? "click", { button: 0, ...init })

describe("viewport selection changes", () => {
  it("a plain click on empty space clears; right-click and Ctrl+click keep", () => {
    const session = createSessionStore()
    const onMiss = createViewportMissHandler(session)
    session.getState().select([part])
    onMiss(miss({ type: "contextmenu", button: 2 }))
    onMiss(miss({ ctrlKey: true }))
    expect(session.getState().selection).toEqual([part])
    onMiss(miss())
    expect(session.getState().selection).toEqual([])
  })

  it("clearing an empty selection keeps the same array (no re-render)", () => {
    const session = createSessionStore()
    const before = session.getState().selection
    createViewportMissHandler(session)(miss())
    expect(session.getState().selection).toBe(before)
  })

  it("replace and toggle use the scene tree's actions", () => {
    const session = createSessionStore()
    applySelectionChange(session, { type: "replace", item: part })
    expect(session.getState().selection).toEqual([part])
    applySelectionChange(session, { type: "toggle", item: part })
    expect(session.getState().selection).toEqual([])
  })
})
