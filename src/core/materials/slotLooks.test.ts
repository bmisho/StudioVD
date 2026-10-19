import { describe, expect, it } from "vitest"
import type { Material, MaterialId } from "@/core/schema"
import { lookKey, slotLooks } from "./slotLooks"

const STEEL = "00000000-0000-4000-8000-000000000001" as MaterialId
const RUBBER = "00000000-0000-4000-8000-000000000002" as MaterialId
const GONE = "00000000-0000-4000-8000-000000000003" as MaterialId
const materials = { [STEEL]: {} as Material, [RUBBER]: {} as Material }
const slots = [
  { name: "Body", color: [1, 0, 0] as [number, number, number] },
  { name: "Trim", color: null },
]

describe("slot looks", () => {
  it("slot override, then the part's material, then the source colour, then the default", () => {
    expect(slotLooks({ materialId: null }, slots, materials)).toEqual([
      { kind: "source", color: [1, 0, 0] },
      { kind: "default" },
    ])
    expect(slotLooks({ materialId: STEEL }, slots, materials)).toEqual([
      { kind: "material", materialId: STEEL },
      { kind: "material", materialId: STEEL },
    ])
    const overridden = { materialId: STEEL, materialSlots: [{ slot: "Trim", materialId: RUBBER }] }
    expect(slotLooks(overridden, slots, materials).map(lookKey)).toEqual([
      `m:${STEEL}`,
      `m:${RUBBER}`,
    ])
  })

  it("falls through references to materials that do not exist", () => {
    const part = { materialId: GONE, materialSlots: [{ slot: "Body", materialId: GONE }] }
    expect(slotLooks(part, slots, materials).map(lookKey)).toEqual(["s:1,0,0", "d"])
  })

  it("never matches an override to an unnamed slot (single-slot assets, boxes)", () => {
    const part = { materialId: null, materialSlots: [{ slot: "Body", materialId: RUBBER }] }
    expect(slotLooks(part, [{ name: null, color: null }], materials)).toEqual([{ kind: "default" }])
  })

  it("does not take inherited keys for material ids", () => {
    const part = { materialId: "toString" as MaterialId }
    expect(slotLooks(part, [{ name: null, color: null }], materials)).toEqual([{ kind: "default" }])
  })
})
