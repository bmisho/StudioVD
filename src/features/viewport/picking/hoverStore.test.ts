import { describe, expect, it, vi } from "vitest"
import type { PartId } from "@/core/schema"
import { createHoverStore, type HoverTarget } from "./hoverStore"

const a: HoverTarget = { kind: "part", id: "a" as PartId }
const b: HoverTarget = { kind: "part", id: "b" as PartId }

describe("hover store", () => {
  it("notifies only on real changes", () => {
    const store = createHoverStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.set(a)
    store.set({ ...a }) // same target, new object: no notification
    store.clearIf(b) // not the hovered one: ignored
    store.clearIf(a)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(store.get()).toBeNull()
  })

  it("stops notifying after unsubscribe", () => {
    const store = createHoverStore()
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    unsubscribe()
    store.set(a)
    expect(listener).not.toHaveBeenCalled()
  })
})
