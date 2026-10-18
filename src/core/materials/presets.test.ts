import { describe, expect, it } from "vitest"
import { createEmptyDocument, MaterialSchema, type MaterialId } from "@/core/schema"
import { uuid } from "@/core/schema/testing/sampleDocument"
import { BUILTIN_MATERIALS } from "./builtinMaterials"
import {
  builtinByKey,
  materialFromBuiltin,
  matchesBuiltin,
  newCustomMaterial,
  reusableMaterial,
  uniqueMaterialName,
} from "./presets"

const id = (n: number) => uuid(n) as MaterialId

describe("built-in materials", () => {
  it("have unique keys and names, each with a density source", () => {
    expect(new Set(BUILTIN_MATERIALS.map((b) => b.key)).size).toBe(BUILTIN_MATERIALS.length)
    expect(new Set(BUILTIN_MATERIALS.map((b) => b.name)).size).toBe(BUILTIN_MATERIALS.length)
    for (const b of BUILTIN_MATERIALS) expect(b.density.source.length, b.key).toBeGreaterThan(10)
  })

  it("keep transmission to clear presets, which are fully opaque in three's sense", () => {
    const clear = BUILTIN_MATERIALS.filter((b) => b.look.transmission > 0).map((b) => b.key)
    expect(clear.sort()).toEqual(["std.glass-soda-lime", "std.pc-clear", "std.pmma"])
    for (const b of BUILTIN_MATERIALS) expect(b.look.opacity).toBe(1)
  })

  it("make valid materials that match their preset until edited", () => {
    for (const b of BUILTIN_MATERIALS) {
      const material = materialFromBuiltin(b, id(1))
      expect(MaterialSchema.safeParse(material).success).toBe(true)
      expect(matchesBuiltin(material, b)).toBe(true)
      expect(matchesBuiltin({ ...material, roughness: 0.99 }, b)).toBe(false)
    }
    expect(MaterialSchema.safeParse(newCustomMaterial(id(2), "Custom")).success).toBe(true)
  })
})

describe("preset reuse", () => {
  it("reuses an unchanged copy of the preset, never an edited one", () => {
    const doc = createEmptyDocument("0.1.0")
    const steel = builtinByKey("std.steel")
    if (!steel) throw new Error("no steel")
    expect(reusableMaterial(doc, steel)).toBeNull()
    const edited = { ...materialFromBuiltin(steel, id(1)), color: "#000000" }
    doc.materials[edited.id] = edited
    expect(reusableMaterial(doc, steel)).toBeNull()
    const plain = materialFromBuiltin(steel, id(2), "Steel 2")
    doc.materials[plain.id] = plain
    expect(reusableMaterial(doc, steel)).toBe(plain)
  })

  it("names copies apart", () => {
    const doc = createEmptyDocument("0.1.0")
    expect(uniqueMaterialName(doc, "Steel")).toBe("Steel")
    const steel = builtinByKey("std.steel")
    if (!steel) throw new Error("no steel")
    doc.materials[id(1)] = materialFromBuiltin(steel, id(1))
    doc.materials[id(2)] = materialFromBuiltin(steel, id(2), "Steel 2")
    expect(uniqueMaterialName(doc, "Steel")).toBe("Steel 3")
  })
})
