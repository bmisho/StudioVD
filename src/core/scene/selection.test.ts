import { describe, expect, it } from "vitest"
import { createEmptyDocument, type AnchorId, type GroupId, type PartId } from "@/core/schema"
import { pruneSelection } from "./selection"

describe("pruneSelection", () => {
  const doc = createEmptyDocument("0.1.0")
  const live = "g-live" as GroupId
  doc.groups[live] = { id: live, name: "Frame", parentId: null }

  it("keeps existing entities and returns the same array when nothing changes", () => {
    const selection = [{ kind: "group" as const, id: live }]
    expect(pruneSelection(doc, selection)).toBe(selection)
  })

  it("drops entities that no longer exist", () => {
    const selection = [
      { kind: "group" as const, id: live },
      { kind: "group" as const, id: "g-gone" },
      { kind: "part" as const, id: "p-gone" },
    ]
    expect(pruneSelection(doc, selection)).toEqual([{ kind: "group", id: live }])
  })

  it("drops anchors that no longer exist (an undone placement)", () => {
    const anchored = createEmptyDocument("0.1.0")
    const id = "a-live" as AnchorId
    anchored.anchors[id] = {
      id,
      partId: "p" as PartId,
      kind: "point",
      frame: { originMm: [0, 0, 0], z: [0, 0, 1], x: [1, 0, 0] },
      source: { kind: "manual" },
    }
    const selection = [
      { kind: "anchor" as const, id },
      { kind: "anchor" as const, id: "a-gone" },
    ]
    expect(pruneSelection(anchored, selection)).toEqual([{ kind: "anchor", id }])
  })

  it("is not fooled by prototype keys", () => {
    expect(pruneSelection(doc, [{ kind: "group" as const, id: "constructor" }])).toEqual([])
  })
})
