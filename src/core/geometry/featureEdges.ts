import { faceNormals } from "./creasedNormals"
import { buildTopology } from "./topology"
import { weldVertices } from "./weld"

/** Draw the edge between two faces that meet at this angle or more (PLAN 6.6). */
export const FEATURE_EDGE_DEG = 30

/** An inclusive triangle range of one face, as `FaceInfo` and occt's `brep_faces` give it. */
export interface TriangleRange {
  first: number
  last: number
}

const NO_NORMALS = new Float32Array(0) // buildTopology reads positions and indices only

/**
 * Feature edges for the "shaded + edges" display mode (PLAN 6.6): pairs of vertex indices into
 * the mesh's own (unwelded) positions, for a LineSegments index sharing the mesh's position
 * attribute. Faces decide: an edge is drawn where two different faces meet at `angleDeg` or
 * more, never inside one face, so the facets of a coarse hole or the seam of a cylinder (one
 * B-rep face each) stay clean. Border and non-manifold edges are always drawn, each once.
 *
 * Degenerate triangles add nothing. One with a repeated (welded) corner is left out of the
 * topology, where it would turn a real edge non-manifold; a zero-area sliver with three
 * distinct corners stays in it (it still joins its neighbours across a T-junction) but neither
 * it nor any pair with it is drawn. Typed arrays throughout; linear in the triangle count
 * apart from the topology's sort.
 */
export function featureEdges(
  mesh: { positions: Float32Array; indices: Uint32Array },
  faces: readonly TriangleRange[],
  angleDeg = FEATURE_EDGE_DEG
): Uint32Array<ArrayBuffer> {
  const { draw, liveIndices } = markFeatureSlots(mesh, faces, angleDeg)
  return emit(draw, liveIndices)
}

/** Marks the edge slots to draw: 0 skip, 1 feature edge, 2 border or non-manifold. */
export function markFeatureSlots(
  mesh: { positions: Float32Array; indices: Uint32Array },
  faces: readonly TriangleRange[],
  angleDeg: number
) {
  const { positions, indices } = mesh
  const weld = weldVertices(positions)
  const { unit } = faceNormals(positions, indices)
  const live = liveTriangles(indices, weld.ids)
  const liveIndices = 3 * live.length === indices.length ? indices : gather(indices, live)
  const liveMesh = { positions, normals: NO_NORMALS, indices: liveIndices }
  const { neighbours } = buildTopology(liveMesh, weld)
  const faceOf = faceIds(faces, indices.length / 3)
  const cos = Math.cos((angleDeg * Math.PI) / 180)
  const flat = (tri: number) =>
    unit[3 * tri] === 0 && unit[3 * tri + 1] === 0 && unit[3 * tri + 2] === 0
  // Per edge slot of the live triangles: 0 skip, 1 feature edge, 2 border or non-manifold.
  const draw = new Uint8Array(3 * live.length)
  let loose = 0
  for (let j = 0; j < live.length; j++) {
    const a = live[j] ?? 0
    if (flat(a)) continue // zero-area sliver: no edges of its own
    for (let e = 0; e < 3; e++) {
      const k = neighbours[3 * j + e] ?? -1
      if (k < 0) {
        draw[3 * j + e] = 2
        loose++
        continue
      }
      if (k <= j) continue // each shared edge once, from its lower triangle
      const b = live[k] ?? 0
      if (flat(b) || ((faceOf[a] ?? -1) >= 0 && faceOf[a] === faceOf[b])) continue
      const d =
        (unit[3 * a] ?? 0) * (unit[3 * b] ?? 0) +
        (unit[3 * a + 1] ?? 0) * (unit[3 * b + 1] ?? 0) +
        (unit[3 * a + 2] ?? 0) * (unit[3 * b + 2] ?? 0)
      if (d <= cos) draw[3 * j + e] = 1
    }
  }
  if (loose > 1) dedupeLoose(draw, loose, liveIndices, weld.ids, weld.count)
  return { draw, liveIndices, live, neighbours, faceOf, weld }
}

/** Triangles with three distinct welded corners (a repeated corner means a zero-length edge). */
function liveTriangles(indices: Uint32Array, ids: Uint32Array): Uint32Array {
  const t = indices.length / 3
  const live = new Uint32Array(t)
  let count = 0
  for (let i = 0; i < t; i++) {
    const a = ids[indices[3 * i] ?? 0] ?? 0
    const b = ids[indices[3 * i + 1] ?? 0] ?? 0
    const c = ids[indices[3 * i + 2] ?? 0] ?? 0
    if (a !== b && b !== c && a !== c) live[count++] = i
  }
  return live.subarray(0, count)
}

/** The index triples of the given triangles, in order. */
function gather(indices: Uint32Array, triangles: Uint32Array): Uint32Array {
  const out = new Uint32Array(3 * triangles.length)
  for (let j = 0; j < triangles.length; j++) {
    const i = 3 * (triangles[j] ?? 0)
    out[3 * j] = indices[i] ?? 0
    out[3 * j + 1] = indices[i + 1] ?? 0
    out[3 * j + 2] = indices[i + 2] ?? 0
  }
  return out
}

/**
 * Face of every triangle, -1 for one outside every range (a face of its own). Ranges are
 * expected in index order, as stored; one that starts before the end of an earlier range is
 * clipped, so a malformed list costs O(t + faces), never O(t · faces), and only adds edges.
 */
function faceIds(faces: readonly TriangleRange[], t: number): Int32Array {
  const faceOf = new Int32Array(t).fill(-1)
  let cursor = 0
  for (const [f, { first, last }] of faces.entries()) {
    const from = Math.max(first, cursor)
    const to = Math.min(last + 1, t)
    if (!(from < to)) continue // empty, out of range or NaN
    faceOf.fill(f, from, to)
    cursor = to
  }
  return faceOf
}

/** A non-manifold edge is loose in every triangle on it: keep one slot per welded edge. */
function dedupeLoose(
  draw: Uint8Array,
  loose: number,
  indices: Uint32Array,
  ids: Uint32Array,
  n: number
): void {
  const slots = new Uint32Array(loose)
  const keys = new Float64Array(loose) // undirected key: min * n + max (< 2^53 for n < 2^26)
  let m = 0
  for (let s = 0; s < draw.length; s++) {
    if (draw[s] !== 2) continue
    const a = ids[indices[s] ?? 0] ?? 0
    const b = ids[indices[s - (s % 3) + ((s + 1) % 3)] ?? 0] ?? 0
    slots[m] = s
    keys[m++] = a < b ? a * n + b : b * n + a
  }
  const order = Uint32Array.from({ length: loose }, (_, i) => i)
  order.sort((x, y) => (keys[x] ?? 0) - (keys[y] ?? 0))
  for (let r = 1; r < loose; r++) {
    const here = order[r] ?? 0
    if (keys[here] === keys[order[r - 1] ?? 0]) draw[slots[here] ?? 0] = 0
  }
}

/** The marked edge slots as vertex index pairs (edge e of a triangle: corner e -> e + 1). */
export function emit(draw: Uint8Array, indices: Uint32Array): Uint32Array<ArrayBuffer> {
  let count = 0
  for (const d of draw) if (d !== 0) count++
  const out = new Uint32Array(2 * count)
  let o = 0
  for (let s = 0; s < draw.length; s++) {
    if (draw[s] === 0) continue
    out[o++] = indices[s] ?? 0
    out[o++] = indices[s - (s % 3) + ((s + 1) % 3)] ?? 0
  }
  return out
}
