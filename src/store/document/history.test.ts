import { describe, expect, it } from "vitest"
import { APP_VERSION } from "@/core/app-info"
import { createEmptyDocument } from "@/core/schema"
import { createDocumentStore, HISTORY_LIMIT } from "./documentStore"
import { createHistory } from "./history"

function setup() {
  const store = createDocumentStore()
  const history = createHistory(store)
  const id = store.getState().createGroup("Frame")
  history.clear()
  const past = () => store.temporal.getState().pastStates.length
  return { store, history, id, past, name: () => store.getState().doc.groups[id]?.name }
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
    const { store, history, id, name, past } = setup()
    const token = history.beginGesture()
    for (const n of ["F", "Fr", "Fra", "Fram", "Frame 2"]) store.getState().renameGroup(id, n)
    history.endGesture(token)
    expect(past()).toBe(1)
    history.undo()
    expect(name()).toBe("Frame")
    history.redo()
    expect(name()).toBe("Frame 2")
  })

  it("adds nothing when a gesture ends where it started, even via other values", () => {
    const { store, history, id, past } = setup()
    const before = store.getState().doc
    const token = history.beginGesture()
    store.getState().renameGroup(id, "Typo")
    store.getState().renameGroup(id, "Frame") // typed back: structurally unchanged
    history.endGesture(token)
    expect(past()).toBe(0)
    // The very same document: nothing reads as an unsaved change.
    expect(store.getState().doc).toBe(before)
  })

  it("restores the start state when a gesture is cancelled", () => {
    const { store, history, id, name } = setup()
    const token = history.beginGesture()
    store.getState().renameGroup(id, "Typo")
    history.cancelGesture(token)
    expect(name()).toBe("Frame")
    expect(history.canUndo()).toBe(false)
    expect(history.isInGesture()).toBe(false)
  })

  it("clears redo when a gesture commits, like any new edit", () => {
    const { store, history, id } = setup()
    store.getState().renameGroup(id, "A")
    history.undo()
    expect(history.canRedo()).toBe(true)
    const token = history.beginGesture()
    store.getState().renameGroup(id, "B")
    history.endGesture(token)
    expect(history.canRedo()).toBe(false)
  })

  it("refuses a second gesture and blocks undo/redo during one", () => {
    const { store, history, id, name } = setup()
    store.getState().renameGroup(id, "A")
    const token = history.beginGesture()
    expect(history.beginGesture()).toBeNull()
    store.getState().renameGroup(id, "B")
    history.undo() // must not fire mid-gesture
    expect(name()).toBe("B")
    history.endGesture(token)
    history.undo()
    expect(name()).toBe("A")
  })

  it("only lets the owner end or cancel a gesture", () => {
    const { store, history, id, name, past } = setup()
    const token = history.beginGesture()
    store.getState().renameGroup(id, "B")
    history.endGesture(Symbol("someone else"))
    history.cancelGesture(null)
    expect(history.isInGesture()).toBe(true)
    expect(name()).toBe("B")
    history.endGesture(token)
    expect(past()).toBe(1)
  })

  it("abandons an open gesture on clear (New/Open) without leaking the old document", () => {
    const { store, history, id, past } = setup()
    const token = history.beginGesture()
    store.getState().renameGroup(id, "Old project edit")
    store.getState().replaceDocument(createEmptyDocument(APP_VERSION, "New project"))
    history.clear()
    expect(history.isInGesture()).toBe(false)

    const fresh = store.getState().createGroup("Fresh")
    expect(past()).toBe(1) // tracking resumed: the new edit is recorded

    history.endGesture(token) // stale owner: must not push the old document
    history.cancelGesture(token)
    expect(past()).toBe(1)
    history.undo()
    expect(store.getState().doc.project.name).toBe("New project")
    expect(store.getState().doc.groups[fresh]).toBeUndefined()
  })

  it("keeps tracking normally after a gesture", () => {
    const { store, history, id, past } = setup()
    const token = history.beginGesture()
    store.getState().renameGroup(id, "B")
    history.endGesture(token)
    store.getState().renameGroup(id, "C")
    expect(past()).toBe(2)
  })

  it("caps history at HISTORY_LIMIT entries, gestures included", () => {
    const { store, history, id, past } = setup()
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) store.getState().renameGroup(id, `N${i}`)
    const token = history.beginGesture()
    store.getState().renameGroup(id, "last")
    history.endGesture(token)
    expect(past()).toBe(HISTORY_LIMIT)
  })
})
