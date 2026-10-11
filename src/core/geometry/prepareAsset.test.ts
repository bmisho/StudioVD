// @vitest-environment node
import { describe, expect, it } from "vitest"
import { decodeGlb } from "./glbRead"
import { prepareAsset, sha256Hex } from "./prepareAsset"
import { boxMesh, cylinderSoup } from "./testing/shapes"

const MM = { mmPerUnit: 1, upAxis: "y" as const }

describe("prepareAsset", () => {
  it("normalizes an STL-style cylinder: smooth normals, 3 faces, closed, volume πr²h", async () => {
    const soup = cylinderSoup(5, 20, 64)
    const asset = await prepareAsset({ name: "pin", positions: soup.positions }, MM)
    if (!asset) throw new Error("no asset")
    expect(asset.faceCount).toBe(3)
    expect(asset.watertight).toBe(true)
    // A 64-gon prism: area = ½ n r² sin(2π/n) instead of πr².
    const area = 0.5 * 64 * 25 * Math.sin((2 * Math.PI) / 64)
    expect(asset.volumeMm3).toBeCloseTo(area * 20, 3)
    expect(asset.id).toBe(await sha256Hex(asset.glb))
    const back = decodeGlb(asset.glb)
    expect(back.faces.map((f) => f.kind).sort()).toEqual(["cylinder", "plane", "plane"])
  })

  it("converts units and Z-up, and recentres into the part offset", async () => {
    const box = boxMesh(1, 2, 3) // in cm, Z-up, centred at the origin
    const shifted = box.positions.map((v, i) => v + ([10, 20, 30][i % 3] ?? 0))
    const asset = await prepareAsset(
      { name: "block", positions: shifted, normals: box.normals, indices: box.indices },
      { mmPerUnit: 10, upAxis: "z" }
    )
    if (!asset) throw new Error("no asset")
    // (x, y, z) -> (x, z, -y), then x10: centre (10, 20, 30) cm -> (100, 300, -200) mm.
    asset.offsetMm.forEach((v, i) => expect(v).toBeCloseTo([100, 300, -200][i] ?? NaN, 4))
    // sizes 1 x 2 x 3 cm -> 10 x 30 x 20 mm after the axis swap
    expect(asset.bboxMm.max.map((v) => Math.round(v * 2))).toEqual([10, 30, 20])
    expect(asset.volumeMm3).toBeCloseTo(6000, 3)
  })

  it("dedups: the same shape somewhere else gets the same asset id", async () => {
    const a = boxMesh(4, 5, 6)
    const moved = a.positions.map((v, i) => v + (i % 3 === 0 ? 250 : 0))
    const one = await prepareAsset({ name: "a", ...a }, MM)
    const two = await prepareAsset({ name: "b", ...a, positions: moved }, MM)
    expect(one?.id).toBe(two?.id)
    expect(two?.offsetMm[0]).toBeCloseTo(250, 6)
  })

  it("flips a closed mesh that is wound inward", async () => {
    const box = boxMesh(2, 2, 2)
    const inward = box.indices.slice()
    for (let t = 0; t < inward.length; t += 3) {
      const b = inward[t + 1] ?? 0
      inward[t + 1] = inward[t + 2] ?? 0
      inward[t + 2] = b
    }
    const asset = await prepareAsset({ name: "b", positions: box.positions, indices: inward }, MM)
    expect(asset?.volumeMm3).toBeCloseTo(8, 6)
  })

  it("keeps B-rep face ranges when they are valid and skips empty meshes", async () => {
    const box = boxMesh(1, 1, 1)
    const ranges = [0, 1, 2, 3, 4, 5].map((f) => ({ first: 2 * f, last: 2 * f + 1 }))
    const asset = await prepareAsset({ name: "c", ...box, faceRanges: ranges }, MM)
    expect(asset?.faceCount).toBe(6)
    expect(await prepareAsset({ name: "e", positions: new Float32Array() }, MM)).toBeNull()
  })
})
