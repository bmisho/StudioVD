import { describe, expect, it } from "vitest"
import { createEmptyDocument, type GroupId } from "@/core/schema"
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

  it("is not fooled by prototype keys", () => {
    expect(pruneSelection(doc, [{ kind: "group" as const, id: "constructor" }])).toEqual([])
  })
})
