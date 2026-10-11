import { describe, expect, it } from "vitest"
import type { GroupId, Part, PartId, SceneDocument } from "@/core/schema"
import { partsInSelection } from "./partsInSelection"

const g = (id: string) => id as GroupId
const p = (id: string) => id as PartId

function part(id: string, parentId: string | null): Part {
  return {
    id: p(id),
    name: id,
    assetId: "0".repeat(64) as Part["assetId"],
    parentId: parentId === null ? null : g(parentId),
    pose: { positionMm: [0, 0, 0], quaternion: [0, 0, 0, 1] },
    materialId: null,
    grounded: false,
    visible: true,
    collider: "box",
  }
}

function doc(): Pick<SceneDocument, "groups" | "parts"> {
  return {
    groups: {
      [g("g1")]: { id: g("g1"), name: "Outer", parentId: null },
      [g("g2")]: { id: g("g2"), name: "Inner", parentId: g("g1") },
      [g("g3")]: { id: g("g3"), name: "Other", parentId: null },
    },
    parts: {
      [p("p1")]: part("p1", "g2"),
      [p("p2")]: part("p2", "g3"),
      [p("p3")]: part("p3", null),
    },
  }
}

describe("partsInSelection", () => {
  it("includes directly selected parts", () => {
    expect([...partsInSelection(doc(), [{ kind: "part", id: "p3" }])]).toEqual(["p3"])
  })

  it("a selected group selects its nested parts at any depth", () => {
    expect([...partsInSelection(doc(), [{ kind: "group", id: "g1" }])]).toEqual(["p1"])
  })

  it("terminates on a parent cycle (corrupt file)", () => {
    const d = doc()
    d.groups[g("g1")] = { id: g("g1"), name: "Outer", parentId: g("g2") }
    expect([...partsInSelection(d, [{ kind: "group", id: "g3" }])]).toEqual(["p2"])
  })

  it("ignores unknown ids and other kinds", () => {
    const set = partsInSelection(doc(), [
      { kind: "group", id: "nope" },
      { kind: "part", id: "missing" },
      { kind: "mate", id: "m1" },
    ])
    expect(set.size).toBe(0)
  })

  it("returns one shared empty set for an empty selection", () => {
    expect(partsInSelection(doc(), [])).toBe(partsInSelection(doc(), []))
  })
})
