/**
 * Groups vertices that lie within `toleranceMm` of each other (STL and OBJ repeat vertices per
 * triangle; STEP splits them per face). Returns, for every vertex, the id of its group, ids
 * numbered 0..count-1 in first-seen order. Hash grid with cell = tolerance; a vertex is
 * compared against the groups of the 27 neighbouring cells, so pairs straddling a cell
 * boundary still merge.
 *
 * Files are untrusted: with a fixed cell hash, a crafted mesh could put every vertex into one
 * bucket and make welding quadratic (minutes for a few hundred thousand vertices). So the hash
 * is keyed with random multipliers per call, and covers the full cell coordinate (cells are up
 * to 1e12 apart, past 32 bits). The result never depends on the hash: a group only matches
 * the cell its representative lies in, so collisions cost time, never a different answer.
 */
export interface Welding {
  ids: Uint32Array
  count: number
}

export const DEFAULT_WELD_TOLERANCE_MM = 1e-4

const TWO_32 = 2 ** 32

/** Six random odd 32-bit multipliers (Web Crypto: Node, browsers and workers). */
function hashKeys(): Uint32Array {
  const keys = crypto.getRandomValues(new Uint32Array(6))
  return keys.map((k) => k | 1)
}

export function weldVertices(
  positions: Float32Array,
  toleranceMm = DEFAULT_WELD_TOLERANCE_MM
): Welding {
  const n = positions.length / 3
  const ids = new Uint32Array(n)
  const k = hashKeys()
  const part = (c: number, lo: number, hi: number) =>
    Math.imul(c | 0, lo) ^ Math.imul(Math.floor(c / TWO_32) | 0, hi)
  const hashCell = (x: number, y: number, z: number) =>
    part(x, k[0] ?? 1, k[1] ?? 1) ^ part(y, k[2] ?? 1, k[3] ?? 1) ^ part(z, k[4] ?? 1, k[5] ?? 1)
  const cells = new Map<number, number[]>() // cell hash -> group ids
  const reps: number[] = [] // group id -> representative vertex
  const repCells: number[] = [] // group id -> its cell (x, y, z), 3 per group
  const tol2 = toleranceMm * toleranceMm
  const at = (i: number) => positions[i] ?? 0
  const near = (g: number, x: number, y: number, z: number) => {
    const r = 3 * (reps[g] ?? 0)
    const ex = at(r) - x
    const ey = at(r + 1) - y
    const ez = at(r + 2) - z
    return ex * ex + ey * ey + ez * ez <= tol2
  }
  const findIn = (cx: number, cy: number, cz: number, x: number, y: number, z: number) => {
    const bucket = cells.get(hashCell(cx, cy, cz))
    if (!bucket) return -1
    for (const g of bucket) {
      const inCell =
        repCells[3 * g] === cx && repCells[3 * g + 1] === cy && repCells[3 * g + 2] === cz
      if (inCell && near(g, x, y, z)) return g
    }
    return -1
  }
  for (let v = 0; v < n; v++) {
    const x = at(3 * v)
    const y = at(3 * v + 1)
    const z = at(3 * v + 2)
    const cx = Math.floor(x / toleranceMm)
    const cy = Math.floor(y / toleranceMm)
    const cz = Math.floor(z / toleranceMm)
    let found = findIn(cx, cy, cz, x, y, z) // fast path: exact duplicates share a cell
    for (let d = 0; found < 0 && d < 27; d++) {
      if (d === 13) continue // own cell, already searched
      const dx = (d % 3) - 1
      const dy = (Math.floor(d / 3) % 3) - 1
      const dz = Math.floor(d / 9) - 1
      found = findIn(cx + dx, cy + dy, cz + dz, x, y, z)
    }
    if (found < 0) {
      found = reps.length
      reps.push(v)
      repCells.push(cx, cy, cz)
      const h = hashCell(cx, cy, cz)
      const bucket = cells.get(h)
      if (bucket) bucket.push(found)
      else cells.set(h, [found])
    }
    ids[v] = found
  }
  return { ids, count: reps.length }
}
