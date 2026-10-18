import { describe, expect, it } from "vitest"
import { BUILTIN_MATERIALS } from "@/core/materials/builtinMaterials"
import type { MaterialId, TextureId } from "./ids"
import { checkIntegrity } from "./integrity"
import { AssetSlotsSchema, MaterialSchema, MaterialSlotsSchema } from "./material"
import { sampleDocument, testMaterial, uuid } from "./testing/sampleDocument"

const steel = () => testMaterial("std.steel", 1)

describe("material schema", () => {
  it("accepts every built-in preset as a document material", () => {
    for (const b of BUILTIN_MATERIALS)
      expect(MaterialSchema.safeParse(testMaterial(b.key, 1)).success, b.key).toBe(true)
  })

  it("refuses values outside what renders and simulates sanely", () => {
    const bad = [
      { color: "#C0BEBB" }, // stored lowercase, compared as text
      { color: "#c0bebb80" },
      { densityKgM3: 0 },
      { densityKgM3: 1e6 }, // inertias would overflow float32
      { ior: 3 },
      { opacity: 1.5 },
      { thicknessMm: -1 },
      { builtinKey: "Steel" },
      { maps: { baseColor: { textureId: "x", tileSizeMm: 10 } } },
      { maps: { baseColor: { textureId: "ab".repeat(32), tileSizeMm: 0 } } },
      { maps: { normal: { textureId: "ab".repeat(32), tileSizeMm: 10 } } }, // not in v1
    ]
    for (const patch of bad)
      expect(
        MaterialSchema.safeParse({ ...steel(), ...patch }).success,
        JSON.stringify(patch)
      ).toBe(false)
  })

  it("keeps slot names as exact text: no control characters, no outer spaces, no repeats", () => {
    const slot = (name: string) => [{ slot: name, materialId: uuid(1) }]
    expect(MaterialSlotsSchema.safeParse(slot("Housing (2)")).success).toBe(true)
    expect(MaterialSlotsSchema.safeParse(slot("#FF0000")).success).toBe(true)
    for (const name of ["", " Housing", "Housing ", "Line\nbreak", "x".repeat(121)])
      expect(MaterialSlotsSchema.safeParse(slot(name)).success, JSON.stringify(name)).toBe(false)
    expect(MaterialSlotsSchema.safeParse([]).success).toBe(false) // absent, not empty
    expect(AssetSlotsSchema.safeParse(["A", "A"]).success).toBe(false)
    expect(AssetSlotsSchema.safeParse(["Only"]).success).toBe(false) // one slot is implicit
  })
})

describe("material references", () => {
  it("require every map's texture", () => {
    const doc = sampleDocument()
    const material = Object.values(doc.materials).find((m) => m.maps)
    if (!material?.maps?.baseColor) throw new Error("sample has no map")
    material.maps.baseColor.textureId = "cd".repeat(32) as TextureId
    expect(checkIntegrity(doc)).toContainEqual({
      path: `materials.${material.id}.maps.baseColor.textureId`,
      message: "refers to something that is missing",
    })
  })

  it("require slot overrides to name a material and a slot of the part's geometry", () => {
    const doc = sampleDocument()
    const part = Object.values(doc.parts).find((p) => p.materialSlots)
    if (!part?.materialSlots) throw new Error("sample has no slots")
    part.materialSlots = [
      { slot: "Trim", materialId: uuid(5) as MaterialId },
      { slot: "Lens", materialId: steel().id },
    ]
    doc.materials[steel().id] = steel()
    expect(checkIntegrity(doc).map((p) => p.path)).toEqual([
      `parts.${part.id}.materialSlots.0.materialId`,
      `parts.${part.id}.materialSlots.1.slot`,
    ])
  })

  it("refuse slot overrides on a part whose geometry has no slots", () => {
    const doc = sampleDocument()
    const part = Object.values(doc.parts).find((p) => !p.materialSlots && p.materialId)
    if (!part) throw new Error("no plain part")
    part.materialSlots = [{ slot: "Default", materialId: part.materialId as MaterialId }]
    expect(checkIntegrity(doc).map((p) => p.path)).toEqual([
      `parts.${part.id}.materialSlots.0.slot`,
    ])
  })
})
