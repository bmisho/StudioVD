// @vitest-environment node
import { describe, expect, it } from "vitest"
import { FEATURE_EDGE_DEG, featureEdges } from "./featureEdges"
import { decodeGlb } from "./glbRead"
import { prepareAsset } from "./prepareAsset"
import { boxMesh, cylinderSoup, gridMesh } from "./testing/shapes"

type Mesh = { positions: Float32Array; indices: Uint32Array }

/** The box's six faces as two-triangle ranges. */
const BOX_FACES = [0, 1, 2, 3, 4, 5].map((f) => ({ first: 2 * f, last: 2 * f + 1 }))

/** Each drawn edge as its two endpoint positions, endpoints sorted, so welded copies compare equal. */
function segments({ positions }: Mesh, edges: Uint32Array): string[] {
  const at = (v: number) => Array.from(positions.subarray(3 * v, 3 * v + 3)).join(",")
  const out: string[] = []
  for (let i = 0; i < edges.length; i += 2)
    out.push([at(edges[i] ?? 0), at(edges[i + 1] ?? 0)].sort().join(" "))
  return out.sort()
}

/** Two quads sharing the edge (0,0,0)-(1,0,0), the second folded up by `deg`, own vertices each. */
function fold(deg: number): Mesh {
  const c = Math.cos((deg * Math.PI) / 180)
  const s = Math.sin((deg * Math.PI) / 180)
  const positions = [0, -1, 0, 1, -1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, c, s, 0, c, s]
  return {
    positions: new Float32Array(positions),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]),
  }
}
const FOLD_FACES = [
  { first: 0, last: 1 },
  { first: 2, last: 3 },
]

describe("featureEdges", () => {
  it("draws the 12 edges of a box with six faces, no diagonals", () => {
    const box = boxMesh(10, 20, 30)
    const edges = featureEdges(box, BOX_FACES)
    expect(edges.length).toBe(24)
    const drawn = segments(box, edges)
    expect(new Set(drawn).size).toBe(12)
    const along = [0, 0, 0]
    for (let i = 0; i < edges.length; i += 2) {
      const p = box.positions.subarray(3 * (edges[i] ?? 0), 3 * (edges[i] ?? 0) + 3)
      const q = box.positions.subarray(3 * (edges[i + 1] ?? 0), 3 * (edges[i + 1] ?? 0) + 3)
      const differs = [0, 1, 2].filter((k) => p[k] !== q[k])
      expect(differs).toHaveLength(1) // a real box edge: two corners on one axis line
      const axis = differs[0] ?? 0
      expect(Math.abs((p[axis] ?? 0) - (q[axis] ?? 0))).toBe([10, 20, 30][axis])
      along[axis] = (along[axis] ?? 0) + 1
    }
    expect(along).toEqual([4, 4, 4])
  })

  it("never draws inside one face: the box as ONE face has no edges (faces decide)", () => {
    // Intended: a B-rep face is smooth by definition, whatever its tessellation's angles.
    expect(featureEdges(boxMesh(1, 1, 1), [{ first: 0, last: 11 }])).toHaveLength(0)
  })

  it("treats triangles outside every range as faces of their own", () => {
    const box = boxMesh(1, 2, 3)
    expect(segments(box, featureEdges(box, []))).toEqual(
      segments(box, featureEdges(box, BOX_FACES))
    )
  })

  it("draws the border of an open quad but not its diagonal", () => {
    const quad: Mesh = {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    }
    const drawn = segments(quad, featureEdges(quad, [{ first: 0, last: 1 }]))
    expect(drawn).toEqual(["0,0,0 1,0,0", "1,0,0 1,1,0", "0,1,0 1,1,0", "0,0,0 0,1,0"].sort())
  })

  it("draws no edge between two coplanar faces, only their outline", () => {
    const flat = fold(0)
    const drawn = segments(flat, featureEdges(flat, FOLD_FACES))
    expect(drawn).toHaveLength(6)
    expect(drawn).not.toContain("0,0,0 1,0,0")
  })

  it("respects the angle: a 20° fold is drawn at 15° but not at 30°", () => {
    const mesh = fold(20)
    expect(FEATURE_EDGE_DEG).toBe(30)
    expect(segments(mesh, featureEdges(mesh, FOLD_FACES))).not.toContain("0,0,0 1,0,0")
    const at15 = segments(mesh, featureEdges(mesh, FOLD_FACES, 15))
    expect(at15).toHaveLength(7)
    expect(at15).toContain("0,0,0 1,0,0")
  })

  it("draws the two rims of a prepared 64-segment cylinder: no seam, no facet lines", async () => {
    const soup = cylinderSoup(5, 20, 64)
    const asset = await prepareAsset(
      { name: "pin", positions: soup.positions },
      { mmPerUnit: 1, upAxis: "y" }
    )
    if (!asset) throw new Error("no asset")
    const { mesh, faces } = decodeGlb(asset.glb)
    expect(faces).toHaveLength(3)
    const edges = featureEdges(mesh, faces)
    expect(edges.length).toBe(2 * 2 * 64)
    expect(new Set(segments(mesh, edges)).size).toBe(128)
    for (let i = 0; i < edges.length; i += 2) {
      const [p, q] = [edges[i] ?? 0, edges[i + 1] ?? 0].map((v) => mesh.positions.subarray(3 * v))
      expect(Math.hypot(p?.[0] ?? 0, p?.[1] ?? 0)).toBeCloseTo(5, 4) // on the rim, not the axis
      expect(Math.abs(p?.[2] ?? 0)).toBeCloseTo(10, 4)
      expect(q?.[2]).toBe(p?.[2]) // around a rim, not down the side
    }
  })

  it("does not hatch a coarse 8-segment cylinder that is one B-rep face", () => {
    // 45° between facets, over the threshold, yet one face: only the rims are edges. Soup
    // order per segment is side, side, top, bottom; regroup it into three face ranges.
    const soup = cylinderSoup(5, 20, 8)
    const order = [
      ...Array.from({ length: 16 }, (_, k) => 4 * Math.floor(k / 2) + (k % 2)),
      ...Array.from({ length: 8 }, (_, i) => 4 * i + 2),
      ...Array.from({ length: 8 }, (_, i) => 4 * i + 3),
    ]
    const mesh = {
      positions: soup.positions,
      indices: Uint32Array.from(order.flatMap((t) => [3 * t, 3 * t + 1, 3 * t + 2])),
    }
    const faces = [
      { first: 0, last: 15 },
      { first: 16, last: 23 },
      { first: 24, last: 31 },
    ]
    expect(featureEdges(mesh, faces)).toHaveLength(2 * 16)
    // Without faces every facet is its own: the 8 lines down the side appear as well.
    expect(featureEdges(mesh, [])).toHaveLength(2 * (16 + 8))
  })

  it("adds nothing for degenerate triangles, even ones on a real edge", () => {
    const box = boxMesh(10, 20, 30)
    const clean = segments(box, featureEdges(box, BOX_FACES))
    const at = (v: number) => Array.from(box.positions.subarray(3 * v, 3 * v + 3))
    const mid = at(0).map((x, k) => (x + (at(1)[k] ?? 0)) / 2)
    // Vertex 24: a copy of vertex 0 (welds onto it); 25: the midpoint of box edge 0-1.
    const positions = new Float32Array([...box.positions, ...at(0), ...mid])
    // On the +x face's diagonal 0-2 (not drawn), a triangle with a repeated corner would make
    // it non-manifold, hence drawn, if it were kept in the topology.
    const indices = new Uint32Array([
      ...box.indices,
      ...[0, 0, 2], // repeated index
      ...[0, 24, 2], // repeated welded corner
      ...[0, 1, 25], // zero-area sliver on box edge 0-1 (its own borders are not drawn)
      ...[3, 3, 3], // a point
    ])
    const mesh = { positions, indices }
    expect(segments(mesh, featureEdges(mesh, BOX_FACES))).toEqual(clean)
  })

  it("draws a non-manifold edge once", () => {
    // Three fins on the edge (0,0,0)-(0,0,1), 120° apart, each its own face.
    const tip = (a: number) => [Math.cos(a), Math.sin(a), 0.5]
    const fins: Mesh = {
      positions: new Float32Array([0, 0, 0, 0, 0, 1, ...tip(0), ...tip(2.0944), ...tip(4.18879)]),
      indices: new Uint32Array([0, 1, 2, 0, 1, 3, 0, 1, 4]),
    }
    const drawn = segments(fins, featureEdges(fins, []))
    expect(drawn).toHaveLength(7)
    expect(new Set(drawn).size).toBe(7)
  })

  it("scales: a 130k-triangle grid as one face gives exactly its border", () => {
    const grid = gridMesh(256)
    const triangles = grid.indices.length / 3
    expect(featureEdges(grid, [{ first: 0, last: triangles - 1 }])).toHaveLength(2 * 4 * 255)
  })
})
