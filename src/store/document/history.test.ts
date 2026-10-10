import { describe, expect, it } from "vitest"
import { createDocumentStore, HISTORY_LIMIT } from "./documentStore"
import { createHistory } from "./history"

function setup() {
  const store = createDocumentStore()
  const history = createHistory(store)
  const id = store.getState().createGroup("Frame")
  history.clear()
  return { store, history, id, name: () => store.getState().doc.groups[id]?.name }
}

describe("history", () => {
  it("undoes and redoes", () => {
    const { store, history, id, name } = setup()
    store.getState().renameGroup(id, "A")
    expect(history.canUndo()).toBe(true)
    history.undo()
    expect(name()).toBe("Frame")
    expect(history.canRedo()).toBe(true)
    history.redo()
    expect(name()).toBe("A")
  })

  it("collapses a gesture into exactly one undo entry", () => {
    const { store, history, id, name } = setup()
    history.beginGesture()
    for (const n of ["F", "Fr", "Fra", "Fram", "Frame 2"]) store.getState().renameGroup(id, n)
    history.endGesture()
    expect(store.temporal.getState().pastStates).toHaveLength(1)
    history.undo()
    expect(name()).toBe("Frame")
    history.redo()
    expect(name()).toBe("Frame 2")
  })

  it("adds nothing when a gesture changes nothing", () => {
    const { history } = setup()
    history.beginGesture()
    history.endGesture()
    expect(history.canUndo()).toBe(false)
  })

  it("restores the start state when a gesture is cancelled", () => {
    const { store, history, id, name } = setup()
    history.beginGesture()
    store.getState().renameGroup(id, "Typo")
    history.cancelGesture()
    expect(name()).toBe("Frame")
    expect(history.canUndo()).toBe(false)
    expect(history.isInGesture()).toBe(false)
  })

  it("clears redo when a gesture commits, like any new edit", () => {
    const { store, history, id } = setup()
    store.getState().renameGroup(id, "A")
    history.undo()
    expect(history.canRedo()).toBe(true)
    history.beginGesture()
    store.getState().renameGroup(id, "B")
    history.endGesture()
    expect(history.canRedo()).toBe(false)
  })

  it("ignores nested begins and blocks undo/redo during a gesture", () => {
    const { store, history, id, name } = setup()
    store.getState().renameGroup(id, "A")
    history.beginGesture()
    history.beginGesture()
    store.getState().renameGroup(id, "B")
    history.undo() // must not fire mid-gesture
    expect(name()).toBe("B")
    history.endGesture()
    expect(history.isInGesture()).toBe(false)
    history.undo()
    expect(name()).toBe("A")
  })

  it("keeps tracking normally after a gesture", () => {
    const { store, history, id } = setup()
    history.beginGesture()
    store.getState().renameGroup(id, "B")
    history.endGesture()
    store.getState().renameGroup(id, "C")
    expect(store.temporal.getState().pastStates).toHaveLength(2)
  })

  it("caps history at HISTORY_LIMIT entries, gestures included", () => {
    const { store, history, id } = setup()
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) store.getState().renameGroup(id, `N${i}`)
    history.beginGesture()
    store.getState().renameGroup(id, "last")
    history.endGesture()
    expect(store.temporal.getState().pastStates).toHaveLength(HISTORY_LIMIT)
  })
})
