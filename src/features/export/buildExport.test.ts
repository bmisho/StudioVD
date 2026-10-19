import { BoxGeometry, Matrix4, MeshPhysicalMaterial } from "three"
import { describe, expect, it } from "vitest"
import { exportGlb } from "./buildExport"

const jsonOf = (glb: Uint8Array): unknown => {
  const length = new DataView(glb.buffer, glb.byteOffset).getUint32(12, true)
  return JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + length)))
}

describe("GLB export", () => {
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
