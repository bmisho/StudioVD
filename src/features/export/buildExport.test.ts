import { BoxGeometry, Matrix4, MeshPhysicalMaterial } from "three"
import { describe, expect, it } from "vitest"
import { exportGlb } from "./buildExport"

const jsonOf = (glb: Uint8Array): unknown => {
  const length = new DataView(glb.buffer, glb.byteOffset).getUint32(12, true)
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + length)))
}

describe("GLB export", () => {
  it("writes one glTF material per material, however many parts and slots use it", async () => {
    const steel = new MeshPhysicalMaterial({ name: "Steel" })
    const glass = new MeshPhysicalMaterial({ name: "Glass", transmission: 1 })
    const slotted = () => {
      const geometry = new BoxGeometry(10, 10, 10)
      geometry.clearGroups()
      geometry.addGroup(0, 18, 0)
      geometry.addGroup(18, 18, 1)
      return geometry
    }
    const part = (name: string, geometry: BoxGeometry, material: MeshPhysicalMaterial[]) => ({
      name,
      geometry,
      material: material.length === 1 ? (material[0] ?? steel) : material,
      matrixWorld: new Matrix4(),
    })
    const glb = await exportGlb([
      part("A", slotted(), [steel, glass]),
      part("B", slotted(), [steel, glass]),
      part("C", new BoxGeometry(5, 5, 5), [steel]),
    ])
    const json = jsonOf(glb) as {
      materials: { name: string }[]
      meshes: { primitives: { material: number }[] }[]
    }
    expect(json.materials.map((m) => m.name)).toEqual(["Steel", "Glass"])
    expect(json.meshes.map((m) => m.primitives.map((p) => p.material))).toEqual([
      [0, 1],
      [0, 1],
      [0],
    ])
  })

  it("writes glass thickness in metres, like the geometry", async () => {
    const glass = new MeshPhysicalMaterial({ transmission: 1, thickness: 3, name: "Glass" })
    const glb = await exportGlb([
      {
        name: "Pane",
        geometry: new BoxGeometry(10, 10, 3),
        material: glass,
        matrixWorld: new Matrix4(),
      },
    ])
    const json = jsonOf(glb) as {
      materials: { extensions?: { KHR_materials_volume?: { thicknessFactor: number } } }[]
      accessors: { max?: number[] }[]
    }
    const volume = json.materials[0]?.extensions?.KHR_materials_volume
    expect(volume?.thicknessFactor).toBeCloseTo(0.003, 9) // 3 mm
    expect(json.accessors[0]?.max?.[2]).toBeCloseTo(0.0015, 6) // the pane is 3 mm thick too
  })
})
