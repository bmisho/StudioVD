// @vitest-environment node
import { describe, expect, it } from "vitest"
import { decodeGlb } from "./glbRead"
import { prepareAsset } from "./prepareAsset"
import { snapFeatures, type SnapArc, type SnapLine } from "./snapFeatures"
import { boxMesh, cylinderSoup } from "./testing/shapes"

/** The box's six faces as two-triangle ranges (planes; snapping only needs the ranges). */
const BOX_FACES = [0, 1, 2, 3, 4, 5].map((f) => ({
  first: 2 * f,
  last: 2 * f + 1,
  kind: "plane" as const,
}))

async function prepared(positions: Float32Array) {
  const asset = await prepareAsset({ name: "p", positions }, { mmPerUnit: 1, upAxis: "y" })
  if (!asset) throw new Error("no asset")
  return decodeGlb(asset.glb)
}

/** n x n vertices, 1 mm apart, in the z = 0 plane: (n - 1)² cells of two triangles. */
function flatGrid(n: number) {
  const positions = new Float32Array(3 * n * n)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) positions.set([x, y, 0], 3 * (y * n + x))
  const indices: number[] = []
  for (let y = 0; y < n - 1; y++)
    for (let x = 0; x < n - 1; x++) {
      const a = y * n + x
      indices.push(a, a + 1, a + n, a + 1, a + n + 1, a + n)
    }
  return { positions, indices: Uint32Array.from(indices) }
}

const arcs = (edges: { kind: string }[]) => edges.filter((e): e is SnapArc => e.kind === "arc")
const lines = (edges: { kind: string }[]) => edges.filter((e): e is SnapLine => e.kind === "line")

describe("snap features", () => {
  it("a box: its 8 corners and 12 straight edges, each between two faces", () => {
    const box = boxMesh(10, 20, 30)
    const { corners, edges } = snapFeatures(box, BOX_FACES)
    expect(corners).toHaveLength(8)
    for (const c of corners) {
      expect(c.at.map(Math.abs)).toEqual([5, 10, 15])
      expect(c.faces).toHaveLength(3)
    }
    expect(lines(edges)).toHaveLength(12)
    expect(arcs(edges)).toHaveLength(0)
    const lengths = lines(edges).map((e) =>
      Math.hypot(...e.end.map((v, i) => v - (e.start[i] ?? 0)))
    )
    expect(lengths.sort((a, b) => a - b)).toEqual([10, 10, 10, 10, 20, 20, 20, 20, 30, 30, 30, 30])
    for (const e of edges)
      expect(e.faces.every((f) => f >= 0) && e.faces[0] < e.faces[1]).toBe(true)
  })

  it("a prepared cylinder: two closed rims around its axis, and its side is a shaft", async () => {
    const { mesh, faces } = await prepared(cylinderSoup(5, 20, 64).positions)
    const { corners, edges, cylinderSense } = snapFeatures(mesh, faces)
    expect(corners).toHaveLength(0)
    const rims = arcs(edges)
    expect(rims).toHaveLength(2)
    for (const rim of rims) {
      expect(rim.closed).toBe(true)
      expect(rim.radius).toBeCloseTo(5, 4)
      expect(rim.axis).toEqual([0, 0, 1]) // canonical sign
      expect(Math.hypot(rim.centre[0], rim.centre[1])).toBeLessThan(1e-4)
    }
    expect(rims.map((r) => r.centre[2]).sort((a, b) => a - b)).toEqual([
      expect.closeTo(-10, 4),
      expect.closeTo(10, 4),
    ])
    const side = faces.findIndex((f) => f.kind === "cylinder")
    expect(cylinderSense[side]).toBe(1)
    expect([...cylinderSense].filter((s) => s !== 0)).toHaveLength(1)
  })

  it("an open sheet: the border turns 90° at the corners, which become vertex snaps", () => {
    const sheet = flatGrid(4) // 3 x 3 cells in the z = 0 plane
    const faces = [{ first: 0, last: sheet.indices.length / 3 - 1, kind: "plane" as const }]
    const { corners, edges } = snapFeatures(sheet, faces)
    expect(corners).toHaveLength(4)
    expect(lines(edges)).toHaveLength(4) // each side one line, not three segments
    for (const e of lines(edges)) expect(e.faces).toEqual([-1, 0])
  })
})
