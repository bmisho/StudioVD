import type { MeshData } from "./meshData"
import { weldVertices, type Welding } from "./weld"

/**
 * Edge topology of a mesh after welding, computed once and shared by normals, face growing
 * and the watertight check. Edges are matched by sorting (a, b) keys, which is linear-ish
 * and allocation-light compared to a Map for millions of edges.
 *
 * - `neighbours[3t + e]`: the triangle across edge e (vertex e -> e+1) of triangle t, or -1
 *   for a border edge, a non-manifold edge (shared by more than two) or a degenerate edge.
 * - `closed`: every non-degenerate edge is shared by exactly two triangles.
 * - `oriented`: every shared edge is traversed in opposite directions by its two triangles.
 */
export interface Topology {
  weld: Welding
  neighbours: Int32Array
  closed: boolean
  oriented: boolean
}

export function buildTopology(mesh: MeshData, weld = weldVertices(mesh.positions)): Topology {
  const { indices } = mesh
  const t = indices.length / 3
  const n = weld.count
  const neighbours = new Int32Array(3 * t).fill(-1)
  const keys = new Float64Array(3 * t) // undirected key: min * n + max (< 2^53 for n < 2^26)
  const order = new Uint32Array(3 * t)
  let edges = 0
  for (let i = 0; i < 3 * t; i++) {
    const a = weld.ids[indices[i] ?? 0] ?? 0
    const b = weld.ids[indices[i - (i % 3) + ((i + 1) % 3)] ?? 0] ?? 0
    if (a === b) continue // degenerate edge: no neighbour
    keys[i] = a < b ? a * n + b : b * n + a
    order[edges++] = i
  }
  const sorted = order.subarray(0, edges).sort((x, y) => (keys[x] ?? 0) - (keys[y] ?? 0))
  let closed = true
  let oriented = true
  for (let s = 0; s < sorted.length;) {
    let e = s + 1
    while (e < sorted.length && keys[sorted[e] ?? 0] === keys[sorted[s] ?? 0]) e++
    if (e - s === 2) {
      const p = sorted[s] ?? 0
      const q = sorted[s + 1] ?? 0
      neighbours[p] = Math.floor(q / 3)
      neighbours[q] = Math.floor(p / 3)
      if (startOf(indices, weld, p) === startOf(indices, weld, q)) oriented = false
    } else {
      closed = false // border (1) or non-manifold (3+)
    }
    s = e
  }
  return { weld, neighbours, closed: closed && edges > 0, oriented }
}

/** Welded id of the first vertex of directed edge slot i (3t + e). */
const startOf = (indices: Uint32Array, weld: Welding, i: number) => weld.ids[indices[i] ?? 0] ?? 0

/** Closed and consistently oriented (each edge shared by exactly two agreeing triangles). */
export const isWatertight = (t: Topology): boolean => t.closed && t.oriented
