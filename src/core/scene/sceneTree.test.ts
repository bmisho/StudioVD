import { describe, expect, it } from "vitest"
import type { AssetId, GroupId, Part, PartId } from "@/core/schema"
import { assemblyGraph } from "@/core/assembly/assemblyGraph"
import { buildSceneTree, MATES_FOLDER_ID } from "./sceneTree"
import { createTestRig } from "./testRig"

const gid = (s: string) => s as GroupId
const pid = (s: string) => s as PartId

function part(id: string, parentId: string | null): Part {
  return {
    id: pid(id),
    name: id,
    assetId: "a".repeat(64) as AssetId,
    parentId: parentId === null ? null : gid(parentId),
    pose: { positionMm: [0, 0, 0], quaternion: [0, 0, 0, 1] },
    materialId: null,
    grounded: false,
    visible: true,
    collider: "hull",
  }
}

describe("buildSceneTree", () => {
  it("nests groups and parts, groups first, in document order", () => {
    const tree = buildSceneTree({
      groups: {
        [gid("g1")]: { id: gid("g1"), name: "Frame", parentId: null },
        [gid("g2")]: { id: gid("g2"), name: "Motor mount", parentId: gid("g1") },
      },
      parts: { [pid("p1")]: part("p1", "g1"), [pid("p0")]: part("p0", null) },
    })
    expect(tree.map((n) => n.id)).toEqual(["g1", "p0"])
    const frame = tree[0]
    expect(frame?.kind === "group" && frame.children.map((n) => n.id)).toEqual(["g2", "p1"])
  })

  it("shows entities with a missing parent at the root instead of dropping them", () => {
    const tree = buildSceneTree({ groups: {}, parts: { [pid("p1")]: part("p1", "gone") } })
    expect(tree.map((n) => n.id)).toEqual(["p1"])
  })

  it("survives a parent cycle in a corrupt document", () => {
    const tree = buildSceneTree({
      groups: {
        [gid("a")]: { id: gid("a"), name: "A", parentId: gid("b") },
        [gid("b")]: { id: gid("b"), name: "B", parentId: gid("a") },
      },
      parts: {},
    })
    const ids = JSON.stringify(tree)
    expect(ids).toContain('"id":"a"')
    expect(ids).toContain('"id":"b"')
  })

  it("returns an empty list for an empty document", () => {
    expect(buildSceneTree({ groups: {}, parts: {} })).toEqual([])
  })
})

describe("buildSceneTree with hostile ids", () => {
  it("does not treat prototype keys as existing parents", () => {
    const tree = buildSceneTree({ groups: {}, parts: { [pid("p1")]: part("p1", "constructor") } })
    expect(tree.map((n) => n.id)).toEqual(["p1"])
  })

  it("ends with a Mates folder: each mate by type and parts, with its issues; mated parts' DOF", () => {
    const rig = createTestRig()
    const doc = {
      groups: {},
      parts: Object.fromEntries(rig.parts.map((p) => [p.id, p])),
      anchors: Object.fromEntries(rig.anchors.map((a) => [a.id, a])),
      mates: Object.fromEntries(rig.mates.map((m) => [m.id, m])),
    }
    const tree = buildSceneTree(doc, assemblyGraph(doc))
    const [base, leaf, mates] = tree
    // The grounded base shows its pin, not "0 DOF"; the leaf turns on its hinge.
    expect([base, leaf].map((n) => n?.kind === "part" && n.dof)).toEqual([undefined, 1])
    expect(mates).toMatchObject({ kind: "mates", id: MATES_FOLDER_ID, name: "Mates" })
    const [hinge] = mates?.kind === "mates" ? mates.children : []
    expect(hinge).toMatchObject({
      kind: "mate",
      type: "revolute",
      name: "Revolute: Base – Leaf",
      issues: [],
    })
    expect(buildSceneTree({ groups: {}, parts: doc.parts })).toHaveLength(2) // no mates: no folder
  })
})
