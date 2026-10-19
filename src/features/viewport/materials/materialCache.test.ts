import { MeshPhysicalMaterial } from "three"
import { describe, expect, it, vi } from "vitest"
import type { Material, MaterialId } from "@/core/schema"
import { testMaterial } from "@/core/schema/testing/sampleDocument"
import { materialCache } from "./materialCache"
import { XRayMaterial } from "./xrayMaterial"

vi.mock("../theme/sceneTokens", () => ({
  readSceneTokens: () => ({ partDefault: "#94a3b8", edge: "#334155" }),
}))
vi.mock("./textureCache", () => ({ textureCache: { get: () => undefined, request: vi.fn() } }))
vi.mock("./triplanar", () => ({ setTriplanarMaps: vi.fn() }))

const docOf = (...materials: Material[]) => ({
  materials: Object.fromEntries(materials.map((m) => [m.id, m])),
  textures: {},
})

describe("material cache", () => {
  it("draws a document material with its physical values, one instance per material", () => {
    const steel = testMaterial("std.steel", 901)
    const look = { kind: "material", materialId: steel.id } as const
    const shaded = materialCache.get(look, "shaded", docOf(steel))
    expect(shaded).toBeInstanceOf(MeshPhysicalMaterial)
    expect(shaded).toMatchObject({ name: "Steel", metalness: 1, transparent: false })
    expect((shaded as MeshPhysicalMaterial).color.getHexString()).toBe(steel.color.slice(1))
    expect(materialCache.get(look, "shaded", docOf(steel))).toBe(shaded)
    const xray = materialCache.get(look, "xray", docOf(steel))
    expect(xray).toBeInstanceOf(XRayMaterial)
  })

  it("applies edits in place; turning transparent recompiles once", () => {
    const pc = testMaterial("std.abs", 902)
    const look = { kind: "material", materialId: pc.id } as const
    const shaded = materialCache.get(look, "shaded", docOf(pc)) as MeshPhysicalMaterial
    const version = shaded.version
    const edited = { ...pc, color: "#ff0000", opacity: 0.4 }
    expect(materialCache.sync(docOf(edited))).toBe(true)
    expect(shaded.color.getHexString()).toBe("ff0000")
    expect([shaded.transparent, shaded.depthWrite, shaded.opacity]).toEqual([true, false, 0.4])
    expect(shaded.version).toBe(version + 1)
    expect(materialCache.sync(docOf(edited))).toBe(false) // unchanged: nothing to redraw
  })

  it("frees the materials of a deleted document material", () => {
    const rubber = testMaterial("std.rubber", 903)
    const look = { kind: "material", materialId: rubber.id } as const
    const shaded = materialCache.get(look, "shaded", docOf(rubber))
    const dispose = vi.spyOn(shaded, "dispose")
    materialCache.sync(docOf())
    expect(dispose).toHaveBeenCalled()
    expect(materialCache.get(look, "shaded", docOf(rubber))).not.toBe(shaded) // undo: anew
  })

  it("draws imported colours (linear) and the default look", () => {
    const source = materialCache.get({ kind: "source", color: [1, 0, 0] }, "shaded", docOf())
    expect((source as MeshPhysicalMaterial).color.toArray()).toEqual([1, 0, 0])
    const plain = materialCache.get({ kind: "default" }, "shaded", docOf())
    expect((plain as MeshPhysicalMaterial).color.getHexString()).toBe("94a3b8")
    const unknown = { kind: "material", materialId: "x" as MaterialId } as const
    expect(materialCache.get(unknown, "shaded", docOf())).toBeInstanceOf(MeshPhysicalMaterial)
  })
})
