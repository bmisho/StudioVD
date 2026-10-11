import type { MeshData } from "./meshData"
import { buildTopology, type Topology } from "./topology"

/** Smooth across edges flatter than this; keep a hard edge (split normals) otherwise. */
export const DEFAULT_CREASE_DEG = 30

/** Unit and area-weighted (|n| = 2·area) normals of every triangle. */
export function faceNormals(positions: Float32Array, indices: Uint32Array) {
  const t = indices.length / 3
  const unit = new Float32Array(3 * t)
  const weighted = new Float32Array(3 * t)
  for (let i = 0; i < t; i++) {
    const a = 3 * (indices[3 * i] ?? 0)
    const b = 3 * (indices[3 * i + 1] ?? 0)
    const c = 3 * (indices[3 * i + 2] ?? 0)
    const ux = (positions[b] ?? 0) - (positions[a] ?? 0)
    const uy = (positions[b + 1] ?? 0) - (positions[a + 1] ?? 0)
    const uz = (positions[b + 2] ?? 0) - (positions[a + 2] ?? 0)
    const vx = (positions[c] ?? 0) - (positions[a] ?? 0)
    const vy = (positions[c + 1] ?? 0) - (positions[a + 1] ?? 0)
    const vz = (positions[c + 2] ?? 0) - (positions[a + 2] ?? 0)
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz)
    weighted.set([nx, ny, nz], 3 * i)
    if (len > 0) unit.set([nx / len, ny / len, nz / len], 3 * i)
  }
  return { unit, weighted }
}

/** Union-find over triangle corners (3t + k) with path halving. */
function unionFind(size: number) {
  const parent = Uint32Array.from({ length: size }, (_, i) => i)
  const find = (x: number) => {
    while (parent[x] !== x) {
      const up = parent[parent[x] ?? x] ?? x
      parent[x] = up
      x = up
    }
    return x
  }
  return {
    find,
    union: (a: number, b: number) => {
      const ra = find(a)
      const rb = find(b)
      if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb)
    },
  }
}

/**
 * Rebuilds normals for a mesh whose own are missing or per-facet (STL). Smoothing groups:
 * across every edge whose two triangles meet at less than the crease angle, the corners at
 * both ends of the edge are joined; each group's normal is the area-weighted sum of its
 * triangles' normals. Curved surfaces come out smooth, CAD edges stay sharp, and the cost is
 * linear in the triangle count (a fan with thousands of triangles around one vertex is fine).
 * Vertices are welded first and re-split only between groups, so the output is indexed.
 */
export function creasedNormals(
  mesh: MeshData,
  creaseDeg = DEFAULT_CREASE_DEG,
  topology: Topology = buildTopology(mesh)
): MeshData {
  const { positions, indices } = mesh
  const { weld, neighbours } = topology
  const { unit, weighted } = faceNormals(positions, indices)
  const t = indices.length / 3
  const cos = Math.cos((creaseDeg * Math.PI) / 180)
  const uf = unionFind(3 * t)
  const wid = (corner: number) => weld.ids[indices[corner] ?? 0] ?? 0
  const cornerOf = (tri: number, w: number) => {
    for (let k = 0; k < 3; k++) if (wid(3 * tri + k) === w) return 3 * tri + k
    return -1
  }
  for (let i = 0; i < t; i++) {
    for (let e = 0; e < 3; e++) {
      const u = neighbours[3 * i + e] ?? -1
      if (u <= i) continue // each shared edge once (u > i), borders are -1
      const d =
        (unit[3 * i] ?? 0) * (unit[3 * u] ?? 0) +
        (unit[3 * i + 1] ?? 0) * (unit[3 * u + 1] ?? 0) +
        (unit[3 * i + 2] ?? 0) * (unit[3 * u + 2] ?? 0)
      if (d < cos) continue
      for (const corner of [3 * i + e, 3 * i + ((e + 1) % 3)]) {
        const other = cornerOf(u, wid(corner))
        if (other >= 0) uf.union(corner, other)
      }
    }
  }
  const sums = new Float64Array(9 * t)
  for (let c = 0; c < 3 * t; c++) {
    const r = uf.find(c)
    const tri = Math.floor(c / 3)
    for (let k = 0; k < 3; k++)
      sums[3 * r + k] = (sums[3 * r + k] ?? 0) + (weighted[3 * tri + k] ?? 0)
  }
  const outOf = new Int32Array(3 * t).fill(-1)
  const outPositions: number[] = []
  const outNormals: number[] = []
  const outIndices = new Uint32Array(indices.length)
  for (let c = 0; c < 3 * t; c++) {
    const r = uf.find(c)
    let out = outOf[r] ?? -1
    if (out < 0) {
      out = outPositions.length / 3
      outOf[r] = out
      const v = indices[c] ?? 0
      outPositions.push(positions[3 * v] ?? 0, positions[3 * v + 1] ?? 0, positions[3 * v + 2] ?? 0)
      const x = sums[3 * r] ?? 0
      const y = sums[3 * r + 1] ?? 0
      const z = sums[3 * r + 2] ?? 0
      const len = Math.hypot(x, y, z)
      if (len > 0) outNormals.push(x / len, y / len, z / len)
      else outNormals.push(0, 1, 0) // degenerate triangle: any unit normal
    }
    outIndices[c] = out
  }
  return {
    positions: new Float32Array(outPositions),
    normals: new Float32Array(outNormals),
    indices: outIndices,
  }
}
