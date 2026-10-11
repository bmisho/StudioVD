import { describe, expect, it } from "vitest"
import type { GroupId } from "@/core/schema"
import { createTestRig } from "@/core/scene/testRig"
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

describe("insertEntities", () => {
  it("inserts a whole batch as one undo entry", () => {
    const store = createDocumentStore()
    const rig = createTestRig()
    store.getState().insertEntities(rig)
    const doc = store.getState().doc
    expect(Object.keys(doc.parts)).toEqual(rig.parts.map((p) => p.id))
    expect(Object.keys(doc.mates)).toHaveLength(1)
    expect(store.temporal.getState().pastStates).toHaveLength(1)

    store.temporal.getState().undo()
    expect(store.getState().doc.parts).toEqual({})
    expect(store.getState().doc.assets).toEqual({})
  })

  it("throws on an invalid batch and leaves the document untouched", () => {
    const store = createDocumentStore()
    const rig = createTestRig()
    const before = store.getState().doc
    expect(() => store.getState().insertEntities({ parts: rig.parts })).toThrow(/unknown asset/)
    expect(store.getState().doc).toBe(before)
    expect(store.temporal.getState().pastStates).toHaveLength(0)
  })

  it("reuses an asset that is already in the document", () => {
    const store = createDocumentStore()
    store.getState().insertEntities(createTestRig())
    const assets = store.getState().doc.assets
    store.getState().insertEntities(createTestRig())
    expect(store.getState().doc.assets).toBe(assets) // content addressed: same entries
    expect(Object.keys(store.getState().doc.parts)).toHaveLength(4)
  })
})
