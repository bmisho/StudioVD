import { describe, expect, it } from "vitest"
import {
  createEmptyDocument,
  type BindingId,
  type CouplingId,
  type GroupId,
  type NodeId,
  type SceneDocument,
} from "@/core/schema"
import { commonParent, partDeletion, topLevelItems } from "./partOps"
import { createTestRig } from "./testRig"

function rigDocument(): SceneDocument {
  const doc = createEmptyDocument("0.1.0")
  const rig = createTestRig()
  for (const a of rig.assets) doc.assets[a.id] = a
  for (const p of rig.parts) doc.parts[p.id] = p
  for (const a of rig.anchors) doc.anchors[a.id] = a
  for (const m of rig.mates) doc.mates[m.id] = m
  return doc
}

describe("partDeletion", () => {
  it("takes the part's anchors, their mates, couplings and bindings, and unused assets", () => {
    const doc = rigDocument()
    const [base, leaf] = Object.values(doc.parts)
    const mate = Object.values(doc.mates)[0]
    if (!base || !leaf || !mate) throw new Error("rig incomplete")
    doc.couplings["c" as CouplingId] = {
      id: "c" as CouplingId,
      kind: "gear",
      mateA: mate.id,
      mateB: mate.id,
      ratio: 2,
    }
    doc.bindings["b" as BindingId] = {
      id: "b" as BindingId,
      from: { kind: "mass", part: leaf.id },
      to: { kind: "param", node: "n" as NodeId, param: "torque" },
      scale: 1,
      offset: 0,
    }
    const gone = partDeletion(doc, [leaf.id])
    expect(gone.parts).toEqual([leaf.id])
    expect(gone.anchors).toHaveLength(1)
    expect(gone.mates).toEqual([mate.id]) // the hinge loses one end
    expect(gone.couplings).toEqual(["c"])
    expect(gone.bindings).toEqual(["b"])
    expect(gone.assets).toEqual([leaf.assetId])
  })

  it("keeps an asset another part still uses, and ignores unknown ids", () => {
    const doc = rigDocument()
    const [base, leaf] = Object.values(doc.parts)
    if (!base || !leaf) throw new Error("rig incomplete")
    leaf.assetId = base.assetId
    const gone = partDeletion(doc, [leaf.id, "nope" as typeof leaf.id])
    expect(gone.parts).toEqual([leaf.id])
    expect(gone.assets).toEqual([])
    expect(Object.keys(doc.anchors)).toHaveLength(2) // pure: the document is untouched
  })
})

describe("grouping helpers", () => {
  const doc = createEmptyDocument("0.1.0")
  const g = (id: string, parentId: string | null) =>
    (doc.groups[id as GroupId] = {
      id: id as GroupId,
      name: id,
      parentId: parentId as GroupId | null,
    })
  g("outer", null)
  g("inner", "outer")
  g("other", null)
  const ref = (id: string) => ({ kind: "group" as const, id })

  it("moves only the outermost selected items", () => {
    expect(topLevelItems(doc, [ref("inner"), ref("outer"), ref("missing")])).toEqual([ref("outer")])
    expect(topLevelItems(doc, [ref("inner"), ref("other")])).toEqual([ref("inner"), ref("other")])
  })

  it("puts the new group under the shared parent, else at the root", () => {
    expect(commonParent(doc, [ref("inner")])).toBe("outer")
    expect(commonParent(doc, [ref("inner"), ref("other")])).toBeNull()
    expect(commonParent(doc, [])).toBeNull()
  })

  it("is not fooled by a parent cycle", () => {
    const cyclic = createEmptyDocument("0.1.0")
    cyclic.groups["a" as GroupId] = { id: "a" as GroupId, name: "a", parentId: "b" as GroupId }
    cyclic.groups["b" as GroupId] = { id: "b" as GroupId, name: "b", parentId: "a" as GroupId }
    expect(topLevelItems(cyclic, [ref("a"), ref("b")])).toEqual([])
  })
})
