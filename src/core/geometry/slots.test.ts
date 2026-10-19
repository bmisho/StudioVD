import { describe, expect, it } from "vitest"
import { MAX_SLOTS } from "@/core/schema"
import { cleanSlotName, groupBySlot, normalizeSlots, slotCollector, slotNames } from "./slots"

const named = (name: string | null, color: [number, number, number] | null = null) => ({
  name,
  color,
})

describe("material slots", () => {
  it("merges slots with the same name and colour and remaps the triangles", () => {
    const { slots, slotOf, folded } = normalizeSlots(
      [named("a", [1, 0, 0]), named("b"), named("a", [1, 0, 0]), named("a", [0, 1, 0])],
      [0, 1, 2, 3, 2]
    )
    expect(slots).toEqual([named("a", [1, 0, 0]), named("b"), named("a", [0, 1, 0])])
    expect(Array.from(slotOf)).toEqual([0, 1, 0, 2, 0])
    expect(folded).toBe(false)
  })

  it(`folds everything past ${MAX_SLOTS} slots into the last one, and says so`, () => {
    const many = Array.from({ length: MAX_SLOTS + 6 }, (_, i) => named(`m${i}`))
    const every = many.map((_, i) => i)
    const { slots, slotOf, folded } = normalizeSlots(many, every)
    expect(slots).toHaveLength(MAX_SLOTS)
    expect([0, MAX_SLOTS - 1, MAX_SLOTS + 5].map((t) => slotOf[t])).toEqual([
      0,
      MAX_SLOTS - 1,
      MAX_SLOTS - 1,
    ])
    expect(folded).toBe(true)
    expect(normalizeSlots(many.slice(0, MAX_SLOTS), [0]).folded).toBe(false)
  })

  it("leaves out slots no triangle uses before folding (an empty occt face has a colour)", () => {
    const many = Array.from({ length: MAX_SLOTS + 1 }, (_, i) => named(`m${i}`))
    const triangles = Array.from({ length: MAX_SLOTS }, (_, t) => t + 1) // m0 unused
    const { slots, slotOf, folded } = normalizeSlots(many, triangles)
    expect(folded).toBe(false)
    expect(slots).toHaveLength(MAX_SLOTS)
    expect(slots[0]?.name).toBe("m1")
    expect(new Set(slotOf).size).toBe(MAX_SLOTS)
  })

  it("names slots: source name, else sRGB hex of the colour, else Default; repeats numbered", () => {
    expect(
      slotNames([
        named("  Paint\n red "),
        named(null, [1, 0.21586050011389926, 0]), // sRGB 128/255 in the middle
        named(null),
        named("Paint red"),
        named("\u0007"),
        named(null),
      ])
    ).toEqual(["Paint red", "#FF8000", "Default", "Paint red (2)", "Default (2)", "Default (3)"])
    expect(slotNames([named("x".repeat(200)), named("x".repeat(130))])[1]).toBe(
      `${"x".repeat(112)} (2)`
    )
  })

  it("cleans source names into names the schema accepts", () => {
    expect(cleanSlotName("\tBolt\u0000 M6\u007f ")).toBe("Bolt M6")
    expect(cleanSlotName("a".repeat(130))).toHaveLength(120)
    expect(cleanSlotName(" \n ")).toBe("")
    // Lone surrogates become U+FFFD, and a cut never splits a pair, so UTF-8 round-trips it.
    expect(cleanSlotName("a\ud800b\udc00")).toBe("a\ufffdb\ufffd")
    const astral = `${"x".repeat(119)}\u{1F534}`
    expect(cleanSlotName(astral)).toBe("x".repeat(119))
    const named = slotNames([
      { name: astral, color: null },
      { name: astral, color: null },
    ])
    for (const n of named) expect(new TextDecoder().decode(new TextEncoder().encode(n))).toBe(n)
  })

  it("collects slots in order of first appearance, colour-only ones by 8-bit sRGB", () => {
    const c = slotCollector()
    expect(c.add(null, [1, 0, 0])).toBe(0)
    expect(c.add(null, [0.9999, 0, 0])).toBe(0) // the same #FF0000
    expect(c.add("red", [1, 0, 0])).toBe(1)
    expect(c.add(null, null)).toBe(2)
    expect(c.add("red", [1, 0, 0])).toBe(1)
    for (let i = c.slots.length; i <= MAX_SLOTS; i++) c.add(`m${i}`, null)
    expect(c.slots).toHaveLength(MAX_SLOTS + 1)
    expect(c.add("one too many", null)).toBe(MAX_SLOTS) // shares the extra slot, later folded
    expect(c.add("m5", null)).toBe(5)
  })

  it("groups faces by slot, stable within a slot", () => {
    // Faces: [0-1] slot 1, [2] slot 0, [3-4] slot 1, [5] slot 0
    const indices = Uint32Array.from({ length: 18 }, (_, i) => i)
    const faces = [
      { first: 0, last: 1 },
      { first: 2, last: 2 },
      { first: 3, last: 4 },
      { first: 5, last: 5 },
    ]
    const out = groupBySlot(indices, faces, [1, 0, 1, 0], 3)
    const triangles = Array.from({ length: 6 }, (_, t) => (out.indices[3 * t] ?? 0) / 3)
    expect(triangles).toEqual([2, 5, 0, 1, 3, 4])
    expect(out.ranges).toEqual([
      { first: 0, last: 0 },
      { first: 1, last: 1 },
      { first: 2, last: 3 },
      { first: 4, last: 5 },
    ])
    expect(out.slotRanges).toEqual([
      { first: 0, last: 1 },
      { first: 2, last: 5 },
      { first: -1, last: -1 }, // unused
    ])
  })
})
