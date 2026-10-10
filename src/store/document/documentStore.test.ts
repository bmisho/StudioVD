import { describe, expect, it } from "vitest"
import type { GroupId } from "@/core/schema"
import { createDocumentStore } from "./documentStore"

describe("document store", () => {
  it("creates, renames and deletes groups", () => {
    const store = createDocumentStore()
    const id = store.getState().createGroup("Frame")
    expect(store.getState().doc.groups[id]).toEqual({ id, name: "Frame", parentId: null })

    store.getState().renameGroup(id, "  Chassis  ")
    expect(store.getState().doc.groups[id]?.name).toBe("Chassis")

    store.getState().deleteGroups([id])
    expect(store.getState().doc.groups[id]).toBeUndefined()
  })

  it("ignores renames to an empty name", () => {
    const store = createDocumentStore()
    const id = store.getState().createGroup("Frame")
    store.getState().renameGroup(id, "   ")
    expect(store.getState().doc.groups[id]?.name).toBe("Frame")
  })

  it("moves children up to the parent when a group is deleted", () => {
    const store = createDocumentStore()
    const { createGroup, deleteGroups } = store.getState()
    const root = createGroup("Root")
    const middle = createGroup("Middle", root)
    const leaf = createGroup("Leaf", middle)
    deleteGroups([middle])
    expect(store.getState().doc.groups[leaf]?.parentId).toBe(root)
  })

  it("records one undo entry per real change and none for no-ops", () => {
    const store = createDocumentStore()
    const temporal = store.temporal
    const id = store.getState().createGroup("Frame")
    expect(temporal.getState().pastStates).toHaveLength(1)

    store.getState().renameGroup(id, "Frame") // same name: no-op
    store.getState().deleteGroups(["missing" as GroupId]) // unknown id: no-op
    expect(temporal.getState().pastStates).toHaveLength(1)

    temporal.getState().undo()
    expect(store.getState().doc.groups[id]).toBeUndefined()
    temporal.getState().redo()
    expect(store.getState().doc.groups[id]?.name).toBe("Frame")
  })
})

describe("document store contract with scene.json", () => {
  it("never writes a name the schema rejects", () => {
    const store = createDocumentStore()
    const id = store.getState().createGroup("Frame")
    store.getState().renameGroup(id, "x".repeat(121))
    expect(store.getState().doc.groups[id]?.name).toBe("Frame")
    expect(() => store.getState().createGroup("   ")).toThrow()
  })

  it("puts a group whose parent no longer exists at the root", () => {
    const store = createDocumentStore()
    const id = store.getState().createGroup("Child", "gone" as GroupId)
    expect(store.getState().doc.groups[id]?.parentId).toBeNull()
    const proto = store.getState().createGroup("Child 2", "constructor" as GroupId)
    expect(store.getState().doc.groups[proto]?.parentId).toBeNull()
  })
})
