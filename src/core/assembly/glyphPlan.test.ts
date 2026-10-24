import { describe, expect, it } from "vitest"
import type { Anchor, AnchorId, PartId } from "@/core/schema"
import { anchorsByPart, anchorsOf } from "./anchorIndex"
import { glyphPlan } from "./glyphPlan"

const anchor = (partId: string, n: number): Anchor => ({
  id: `${partId}-${n}` as AnchorId,
  partId: partId as PartId,
  kind: "point",
  frame: { originMm: [n, 0, 0], z: [0, 0, 1], x: [1, 0, 0] },
  source: { kind: "manual" },
})
/** `counts[p]` anchors on part `p`, as a document record (insertion order kept). */
const record = (counts: Record<string, number>) =>
  Object.fromEntries(
    Object.entries(counts).flatMap(([p, n]) =>
      Array.from({ length: n }, (_, i) => anchor(p, i)).map((a) => [a.id, a])
    )
  ) as Record<AnchorId, Anchor>
const parts = (...ids: string[]) => ids as PartId[]

describe("anchor index", () => {
  it("groups anchors by part in document order, once per record", () => {
    const anchors = record({ a: 2, b: 1 })
    expect(anchorsOf(anchors, "a" as PartId).map((x) => x.id)).toEqual(["a-0", "a-1"])
    expect(anchorsOf(anchors, "none" as PartId)).toEqual([])
    expect(anchorsByPart(anchors)).toBe(anchorsByPart(anchors)) // built once
  })
})

describe("glyph plan", () => {
  it("shows every anchor of the showing parts while within the budget, no others", () => {
    const plan = glyphPlan(record({ a: 2, b: 1, c: 3 }), parts("a", "b"), new Set())
    expect(Object.fromEntries(plan)).toEqual({ a: ["a-0", "a-1"], b: ["b-0"] })
  })

  it("caps them, the selected first, then a share of every part in turn", () => {
    const anchors = record({ a: 1000, b: 3, c: 1 })
    const plan = glyphPlan(anchors, parts("a", "b", "c"), new Set(["a-999" as AnchorId]), 8)
    expect([...plan.values()].flat()).toHaveLength(8)
    expect(plan.get("a" as PartId)?.[0]).toBe("a-999") // never left out
    expect(plan.get("b" as PartId)).toEqual(["b-0", "b-1", "b-2"])
    expect(plan.get("c" as PartId)).toEqual(["c-0"])
  })

  it("ignores a selected anchor on a part that does not show its anchors", () => {
    const plan = glyphPlan(record({ a: 1, b: 1 }), parts("a"), new Set(["b-0" as AnchorId]))
    expect([...plan.keys()]).toEqual(["a"])
  })
})
