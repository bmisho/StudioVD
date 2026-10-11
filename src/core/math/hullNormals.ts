/**
 * Outline ("inverted hull") normals: for every vertex, the angle-weighted sum of the face
 * normals of all triangles that share its POSITION (vertices welded within `weldMm`), unit
 * length. Unlike the render normals of a CAD mesh (split at hard edges), these are continuous,
 * so a hull pushed out along them has no cracks at box corners. Triangulation independent: a
 * box corner gets (+-1, +-1, +-1)/sqrt(3). O(n); run in the import worker for big meshes.
 */
export function computeHullNormals(
  positions: ArrayLike<number>,
  index: ArrayLike<number> | null,
  fallbackNormals: ArrayLike<number> | null,
  weldMm = 1e-3
): Float32Array {
  const vertexCount = Math.floor(positions.length / 3)
  const slotOf = new Uint32Array(vertexCount)
  const slots = new Map<string, number>()
  for (let v = 0; v < vertexCount; v++) {
    const key = `${q(positions, 3 * v, weldMm)},${q(positions, 3 * v + 1, weldMm)},${q(positions, 3 * v + 2, weldMm)}`
    let slot = slots.get(key)
    if (slot === undefined) {
      slot = slots.size
      slots.set(key, slot)
    }
    slotOf[v] = slot
  }

  const sum = new Float64Array(slots.size * 3)
  const triangleCount = Math.floor((index ? index.length : vertexCount) / 3)
  const ids = [0, 0, 0]
  for (let t = 0; t < triangleCount; t++) {
    for (let k = 0; k < 3; k++) ids[k] = index ? at(index, 3 * t + k) : 3 * t + k
    const [a = 0, b = 0, c = 0] = ids
    const n = faceNormal(positions, a, b, c)
    if (n === null) continue // degenerate triangle
    addAngleWeighted(sum, at(slotOf, a), n, angleAt(positions, a, b, c))
    addAngleWeighted(sum, at(slotOf, b), n, angleAt(positions, b, c, a))
    addAngleWeighted(sum, at(slotOf, c), n, angleAt(positions, c, a, b))
  }

  const out = new Float32Array(vertexCount * 3)
  for (let v = 0; v < vertexCount; v++) {
    const s = at(slotOf, v)
    let x = at(sum, 3 * s)
    let y = at(sum, 3 * s + 1)
    let z = at(sum, 3 * s + 2)
    let len = Math.hypot(x, y, z)
    if (len < 1e-12 && fallbackNormals) {
      // Opposite faces cancel (zero-thickness sheet): fall back to the render normal.
      x = at(fallbackNormals, 3 * v)
      y = at(fallbackNormals, 3 * v + 1)
      z = at(fallbackNormals, 3 * v + 2)
      len = Math.hypot(x, y, z)
    }
    if (len < 1e-12) continue // leaves (0,0,0): the shader skips the offset for this vertex
    out[3 * v] = x / len
    out[3 * v + 1] = y / len
    out[3 * v + 2] = z / len
  }
  return out
}

// `noUncheckedIndexedAccess`: typed-array reads are in range by construction.
const at = (a: ArrayLike<number>, i: number): number => a[i] ?? 0
const q = (p: ArrayLike<number>, i: number, step: number) => Math.round(at(p, i) / step)

function sub(p: ArrayLike<number>, i: number, j: number): [number, number, number] {
  return [
    at(p, 3 * i) - at(p, 3 * j),
    at(p, 3 * i + 1) - at(p, 3 * j + 1),
    at(p, 3 * i + 2) - at(p, 3 * j + 2),
  ]
}

function faceNormal(p: ArrayLike<number>, a: number, b: number, c: number) {
  const [ux, uy, uz] = sub(p, b, a)
  const [vx, vy, vz] = sub(p, c, a)
  const n: [number, number, number] = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]
  const len = Math.hypot(...n)
  return len < 1e-12 ? null : n.map((x) => x / len)
}

function angleAt(p: ArrayLike<number>, apex: number, b: number, c: number): number {
  const u = sub(p, b, apex)
  const v = sub(p, c, apex)
  const dot = u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
  const len = Math.hypot(...u) * Math.hypot(...v)
  return len < 1e-24 ? 0 : Math.acos(Math.min(1, Math.max(-1, dot / len)))
}

function addAngleWeighted(sum: Float64Array, slot: number, n: number[], w: number) {
  sum[3 * slot] = at(sum, 3 * slot) + at(n, 0) * w
  sum[3 * slot + 1] = at(sum, 3 * slot + 1) + at(n, 1) * w
  sum[3 * slot + 2] = at(sum, 3 * slot + 2) + at(n, 2) * w
}
