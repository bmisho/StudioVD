import type { FeatureSegments } from "./featureSegments"

/** A B-rep-like edge: feature segments between the same two faces, joined end to end. */
export interface EdgeChain {
  /** Unwelded vertex indices along the chain; a closed chain repeats its first at the end. */
  vertices: number[]
  closed: boolean
  /** The faces on its two sides, lower first (-1: none). */
  faces: [number, number]
}

/** A vertex where chains end because the outline turns there (a corner of the part). */
export interface ChainCorner {
  /** One unwelded vertex index of the corner. */
  vertex: number
  /** Faces of the edges that meet there. */
  faces: number[]
}

/**
 * A vertex with two edges is still a corner when the outline turns more than this there (the
 * border of an open sheet). Tessellated holes turn 360°/n per vertex: an octagon (45°) or a
 * hexagon (60°) stays one circle, a square splits into four lines.
 */
const CORNER_DEG = 60
const CORNER_COS = Math.cos((CORNER_DEG * Math.PI) / 180)

/**
 * Joins feature segments into chains (PLAN 7.3): a chain ends at a corner (where 1 or 3+
 * edges meet, or the outline turns sharply) and wherever the faces on its sides change, so
 * a hole rim split between two half-cylinder faces gives two arcs, and a slot outline its
 * lines and arcs separately. Linear in the number of segments.
 */
export function edgeChains(seg: FeatureSegments, positions: Float32Array) {
  const n = seg.ends.length / 2
  const count = seg.weldedCount
  const rep = new Int32Array(count).fill(-1)
  const degree = new Uint32Array(count)
  for (let i = 0; i < 2 * n; i++) {
    const w = seg.welded[i] ?? 0
    degree[w] = (degree[w] ?? 0) + 1
    if (rep[w] === -1) rep[w] = seg.ends[i] ?? 0
  }
  const offset = new Uint32Array(count + 1)
  for (let w = 0; w < count; w++) offset[w + 1] = (offset[w] ?? 0) + (degree[w] ?? 0)
  const fill = offset.slice(0, count)
  const incident = new Uint32Array(2 * n)
  for (let i = 0; i < 2 * n; i++) {
    const w = seg.welded[i] ?? 0
    const slot = fill[w] ?? 0
    incident[slot] = Math.floor(i / 2)
    fill[w] = slot + 1
  }
  const other = (s: number, w: number) =>
    seg.welded[2 * s] === w ? (seg.welded[2 * s + 1] ?? 0) : (seg.welded[2 * s] ?? 0)
  const at = (w: number, k: number) => positions[3 * (rep[w] ?? 0) + k] ?? 0

  const corner = new Uint8Array(count)
  for (let w = 0; w < count; w++) {
    if (degree[w] !== 2) {
      corner[w] = degree[w] === 0 ? 0 : 1
      continue
    }
    const a = other(incident[offset[w] ?? 0] ?? 0, w)
    const b = other(incident[(offset[w] ?? 0) + 1] ?? 0, w)
    let dot = 0
    let la = 0
    let lb = 0
    for (let k = 0; k < 3; k++) {
      const da = at(w, k) - at(a, k) // incoming direction
      const db = at(b, k) - at(w, k) // outgoing direction
      dot += da * db
      la += da * da
      lb += db * db
    }
    if (la > 0 && lb > 0 && dot < CORNER_COS * Math.sqrt(la * lb)) corner[w] = 1
  }

  const samePair = (s: number, t: number) =>
    seg.faces[2 * s] === seg.faces[2 * t] && seg.faces[2 * s + 1] === seg.faces[2 * t + 1]
  const visited = new Uint8Array(n)
  /** The next segment of the chain at `w`, or -1 where the chain ends. */
  const next = (s: number, w: number) => {
    if (corner[w]) return -1
    const first = incident[offset[w] ?? 0] ?? 0
    const t = first === s ? (incident[(offset[w] ?? 0) + 1] ?? 0) : first
    return visited[t] || !samePair(s, t) ? -1 : t
  }

  const chains: EdgeChain[] = []
  for (let s = 0; s < n; s++) {
    if (visited[s]) continue
    visited[s] = 1
    const start = seg.welded[2 * s] ?? 0
    const ahead = [start, seg.welded[2 * s + 1] ?? 0]
    let closed = false
    for (let cur = s, w = ahead[1] ?? 0, t = next(cur, w); t >= 0; t = next(cur, w)) {
      visited[t] = 1
      w = other(t, w)
      ahead.push(w)
      cur = t
      if (w === start) {
        closed = true
        break
      }
    }
    const behind: number[] = []
    if (!closed)
      for (let cur = s, w = start, t = next(cur, w); t >= 0; t = next(cur, w)) {
        visited[t] = 1
        w = other(t, w)
        behind.push(w)
        cur = t
      }
    const welded = [...behind.reverse(), ...ahead]
    chains.push({
      vertices: welded.map((w) => rep[w] ?? 0),
      closed,
      faces: [seg.faces[2 * s] ?? -1, seg.faces[2 * s + 1] ?? -1],
    })
  }

  const corners: ChainCorner[] = []
  for (let w = 0; w < count; w++) {
    if (!corner[w]) continue
    const faces = new Set<number>()
    for (let i = offset[w] ?? 0; i < (offset[w + 1] ?? 0); i++) {
      const s = incident[i] ?? 0
      for (const f of [seg.faces[2 * s] ?? -1, seg.faces[2 * s + 1] ?? -1]) if (f >= 0) faces.add(f)
    }
    corners.push({ vertex: rep[w] ?? 0, faces: [...faces] })
  }
  return { chains, corners }
}
