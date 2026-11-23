import { describe, expect, it } from "vitest"
import {
  selectionForContextMenu,
  hoverTargetForMove,
  isPlainClick,
  isPrimaryClick,
  periodicRefreshDue,
  selectionChangeForClick,
  type ViewportClick,
} from "./pickPolicy"
import type { SelectionRef } from "./selection"

const part: SelectionRef = { kind: "part", id: "p1" }
const click = (over: Partial<ViewportClick<SelectionRef>>): ViewportClick<SelectionRef> => ({
  type: "click",
  button: 0,
  delta: 0,
  additive: false,
  target: part,
  ...over,
})

describe("selectionChangeForClick", () => {
  it("a plain click on a part replaces the selection", () => {
    expect(selectionChangeForClick(click({}))).toEqual({ type: "replace", item: part })
  })

  it("Ctrl+click toggles, within the 2 px slop", () => {
    expect(selectionChangeForClick(click({ delta: 2, additive: true }))).toEqual({
      type: "toggle",
      item: part,
    })
  })

  it("ignores drags beyond the slop and non-primary buttons", () => {
    expect(selectionChangeForClick(click({ delta: 3 }))).toEqual({ type: "none" })
    expect(selectionChangeForClick(click({ button: 1 }))).toEqual({ type: "none" })
  })

  it("ignores right-click and double-click misses", () => {
    expect(selectionChangeForClick(click({ type: "contextmenu", target: null }))).toEqual({
      type: "none",
    })
    expect(selectionChangeForClick(click({ type: "dblclick", target: null }))).toEqual({
      type: "none",
    })
  })

  it("a plain click on empty space clears; Ctrl+click there keeps the selection", () => {
    expect(selectionChangeForClick(click({ target: null }))).toEqual({ type: "clear" })
    expect(selectionChangeForClick(click({ target: null, additive: true }))).toEqual({
      type: "none",
    })
  })
})

describe("hoverTargetForMove", () => {
  it("pre-highlights only while no button is held", () => {
    expect(hoverTargetForMove(0, part)).toBe(part)
    expect(hoverTargetForMove(4, part)).toBeNull() // middle-button orbit
    expect(hoverTargetForMove(1, part)).toBeNull() // left drag (test-mode grab)
  })
})

describe("periodicRefreshDue", () => {
  it("is due every period, and never without one (design mode)", () => {
    expect(periodicRefreshDue(150, 100, 100)).toBe(false)
    expect(periodicRefreshDue(200, 100, 100)).toBe(true)
    expect(periodicRefreshDue(1e6, 0)).toBe(false)
  })

  it("does not stall when the clock restarts (frameloop switch resets R3F's clock)", () => {
    // Two minutes of design-mode orbiting, then test mode restarts the clock at 0.
    expect(periodicRefreshDue(16, 120_000, 100)).toBe(true)
  })
})

describe("plain and primary clicks", () => {
  it("drop drags and other buttons; only a plain click drops a double click's second", () => {
    const at = (detail: number, button = 0) => ({ type: "click", button, detail })
    expect([isPlainClick(at(1), 2), isPrimaryClick(at(1), 2)]).toEqual([true, true])
    expect([isPlainClick(at(2), 0), isPrimaryClick(at(2), 0)]).toEqual([false, true])
    expect([isPlainClick(at(1), 3), isPrimaryClick(at(1), 3)]).toEqual([false, false])
    expect(isPrimaryClick(at(1, 1), 0)).toBe(false)
    expect(isPrimaryClick({ type: "dblclick", button: 0 }, 0)).toBe(false)
  })
})

describe("selectionForContextMenu (PLAN 15.4)", () => {
  const a = { kind: "part" as const, id: "a" }
  const b = { kind: "part" as const, id: "b" }
  it("selects what is under the pointer unless it is selected already", () => {
    expect(selectionForContextMenu([a], b)).toEqual(b)
    expect(selectionForContextMenu([a, b], b)).toBeNull()
    expect(selectionForContextMenu([a], null)).toBeNull()
    expect(selectionForContextMenu([{ kind: "group", id: "b" }], b)).toEqual(b)
  })
})
