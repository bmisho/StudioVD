/**
 * Groups vertices that lie within `toleranceMm` of each other (STL and OBJ repeat vertices per
 * triangle; STEP splits them per face). Returns, for every vertex, the id of its group, ids
 * numbered 0..count-1 in first-seen order. Hash grid with cell = tolerance; a vertex is
 * compared against the 27 neighbouring cells, so pairs straddling a cell boundary still merge.
 * Cells are hashed to numbers (collisions only cost extra distance checks).
 */
export interface Welding {
  ids: Uint32Array
  count: number
}

export const DEFAULT_WELD_TOLERANCE_MM = 1e-4

const hashCell = (x: number, y: number, z: number) =>
  (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) | 0

export function weldVertices(
  positions: Float32Array,
  toleranceMm = DEFAULT_WELD_TOLERANCE_MM
): Welding {
  const n = positions.length / 3
  const ids = new Uint32Array(n)
  const cells = new Map<number, number[]>() // cell hash -> group ids
  const reps: number[] = [] // group id -> representative vertex
  const tol2 = toleranceMm * toleranceMm
  const at = (i: number) => positions[i] ?? 0
  const near = (g: number, x: number, y: number, z: number) => {
    const r = 3 * (reps[g] ?? 0)
    const ex = at(r) - x
    const ey = at(r + 1) - y
    const ez = at(r + 2) - z
    return ex * ex + ey * ey + ez * ez <= tol2
  }
  const findIn = (h: number, x: number, y: number, z: number) => {
    const bucket = cells.get(h)
    if (bucket) for (const g of bucket) if (near(g, x, y, z)) return g
    return -1
  }
  for (let v = 0; v < n; v++) {
    const x = at(3 * v)
    const y = at(3 * v + 1)
    const z = at(3 * v + 2)
    const cx = Math.floor(x / toleranceMm)
    const cy = Math.floor(y / toleranceMm)
    const cz = Math.floor(z / toleranceMm)
    const own = hashCell(cx, cy, cz)
    let found = findIn(own, x, y, z) // fast path: exact duplicates land in the same cell
    for (let d = 0; found < 0 && d < 27; d++) {
      if (d === 13) continue // own cell, already searched
      found = findIn(
        hashCell(
          cx + ((d % 3) - 1),
          cy + ((Math.floor(d / 3) % 3) - 1),
          cz + (Math.floor(d / 9) - 1)
        ),
        x,
        y,
        z
      )
    }
    if (found < 0) {
      found = reps.length
      reps.push(v)
      const bucket = cells.get(own)
      if (bucket) bucket.push(found)
      else cells.set(own, [found])
    }
    ids[v] = found
  }
  return { ids, count: reps.length }
}
