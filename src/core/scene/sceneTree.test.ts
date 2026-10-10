import { describe, expect, it } from "vitest"
import type { AssetId, GroupId, Part, PartId } from "@/core/schema"
import { buildSceneTree } from "./sceneTree"

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
