// @vitest-environment node
import { describe, expect, it } from "vitest"
import { MAX_SLOTS, type Vec3 } from "@/core/schema"
import { decodeGlb, slotAt } from "./glbRead"
import { prepareAsset, type SourceMesh } from "./prepareAsset"
import { boxMesh, cylinderSoup, gridMesh } from "./testing/shapes"

const MM = { mmPerUnit: 1, upAxis: "y" as const }
const GREY: Vec3 = [0.6, 0.6, 0.6] // sRGB #CBCBCB (203.4), away from a rounding edge
const RED: Vec3 = [1, 0, 0]

/** A 4 x 5 x 6 box whose triangles `red` are red, the rest grey (box faces are 2 triangles). */
function paintedBox(red: number[]): SourceMesh {
  const box = boxMesh(4, 5, 6)
  const triangleSlots = Uint16Array.from({ length: 12 }, (_, t) => (red.includes(t) ? 1 : 0))
  return {
    name: "box",
    ...box,
    slots: [
      { name: null, color: GREY },
      { name: null, color: RED },
    ],
    triangleSlots,
  }
}

async function prepared(source: SourceMesh) {
  const asset = await prepareAsset(source, MM)
  if (!asset) throw new Error("no asset")
  return { asset, glb: decodeGlb(asset.glb) }
}

describe("prepareAsset material slots", () => {
  it("gives single-colour imports the asset ids they had before slots (Phase 5)", async () => {
    // Computed at commit 27c2d8c: re-importing a file dedups against existing projects.
    const soup = cylinderSoup(5, 20, 64)
    expect((await prepared({ name: "pin", positions: soup.positions })).asset.id).toBe(
      "086958ea5ff20f9e526c731f4fcb6588838f035f14a619bacda111324b754d18"
    )
    const box = boxMesh(4, 5, 6)
    const faceRanges = [0, 1, 2, 3, 4, 5].map((f) => ({ first: 2 * f, last: 2 * f + 1 }))
    const brep = await prepareAsset(
      { name: "b", ...box, faceRanges, color: [0.2, 0.4, 0.6] },
      { mmPerUnit: 1, upAxis: "z" }
    )
    expect(brep?.id).toBe("2dd80dac4c5f94df825a582e1f537675a877597fdb1a7de2d06fb8ae75bcda6c")
    expect((await prepared({ name: "c", ...box, color: [0.5, 0.5, 0.5] })).asset.id).toBe(
      "bd065fd3c701f7ec7f3cbbb457f8288ce9b51fbeb22c9c5fe8eca13d3d13dab9"
    )
  })

  it("stores two colours as two named slots, each a range of whole faces", async () => {
    const { asset, glb } = await prepared(paintedBox([4, 5]))
    expect(asset.slots).toEqual(["#CBCBCB", "#FF0000"])
    expect(asset.slotsFolded).toBe(false)
    expect(glb.slots.map((s) => [s.name, s.first, s.last])).toEqual([
      ["#CBCBCB", 0, 9],
      ["#FF0000", 10, 11],
    ])
    expect(asset.faceCount).toBe(6)
    for (const f of glb.faces) expect(slotAt(glb.slots, f.first)).toBe(slotAt(glb.slots, f.last))
    // Appearance only: still one closed body.
    expect(asset.watertight).toBe(true)
    expect(asset.volumeMm3).toBeCloseTo(120, 6)
  })

  it("never grows a face across a slot boundary", async () => {
    const { asset, glb } = await prepared(paintedBox([4])) // half of one box side
    expect(asset.faceCount).toBe(7)
    for (const f of glb.faces) expect(slotAt(glb.slots, f.first)).toBe(slotAt(glb.slots, f.last))
  })

  it("replaces B-rep faces that straddle slots with grown ones", async () => {
    const source = { ...paintedBox([4, 5]), faceRanges: [{ first: 0, last: 11 }] }
    const { asset, glb } = await prepared(source)
    expect(asset.faceCount).toBe(6)
    expect(glb.slots).toHaveLength(2)
  })

  it("keeps B-rep faces when occt reports an empty one", async () => {
    const box = boxMesh(4, 5, 6)
    const faceRanges = [
      { first: 0, last: 5 },
      { first: 6, last: 5 }, // a face with no triangles
      { first: 6, last: 11 },
    ]
    const { asset } = await prepared({ name: "b", ...box, faceRanges })
    expect(asset.faceCount).toBe(2) // grown faces would give the box's 6 sides
  })

  it("drops slots no triangle uses; one slot left is a single-colour asset", async () => {
    const unused = await prepared(paintedBox([]))
    expect(unused.asset.slots).toEqual([])
    const plain = await prepared({ name: "box", ...boxMesh(4, 5, 6), color: GREY })
    expect(unused.asset.id).toBe(plain.asset.id)
  })

  it(`folds sources with more than ${MAX_SLOTS} materials into the last slot`, async () => {
    const grid = gridMesh(10) // 162 triangles
    const count = MAX_SLOTS + 6
    const { asset, glb } = await prepared({
      name: "g",
      ...grid,
      slots: Array.from({ length: count }, (_, i) => ({ name: `m${i}`, color: null })),
      triangleSlots: Uint16Array.from({ length: 162 }, (_, t) => t % count),
    })
    expect(asset.slots).toHaveLength(MAX_SLOTS)
    expect(asset.slots.at(-1)).toBe(`m${MAX_SLOTS - 1}`)
    expect(asset.slotsFolded).toBe(true)
    expect(glb.slots).toHaveLength(MAX_SLOTS)
  })

  it("leaves out vertices no triangle uses (glTF primitives share vertex buffers)", async () => {
    const box = boxMesh(4, 5, 6)
    const extra = new Float32Array([...box.positions, 99, 99, 99, 50, 50, 50])
    const normals = new Float32Array([...box.normals, 0, 0, 1, 0, 0, 1])
    const padded = await prepared({ name: "p", positions: extra, normals, indices: box.indices })
    const plain = await prepared({ name: "p", ...box })
    expect(padded.asset.id).toBe(plain.asset.id)
    expect(padded.glb.mesh.positions).toHaveLength(box.positions.length)
  })
})
