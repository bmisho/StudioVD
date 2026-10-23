import { FEATURE_EDGE_DEG, emit, markFeatureSlots, type TriangleRange } from "./featureEdges"

/**
 * The same edges with what anchor snapping needs (PLAN 7.3): per segment its two ends as
 * unwelded vertex indices and as welded ids (shared where segments meet), and the faces on
 * its two sides, lower first (-1: a border, or a triangle outside every face).
 */
export interface FeatureSegments {
  ends: Uint32Array
  welded: Uint32Array
  faces: Int32Array
  /** Number of welded vertices (ids are 0..count-1). */
  weldedCount: number
}

export function featureSegments(
  mesh: { positions: Float32Array; indices: Uint32Array },
  faces: readonly TriangleRange[],
  angleDeg = FEATURE_EDGE_DEG
): FeatureSegments {
  const { draw, liveIndices, live, neighbours, faceOf, weld } = markFeatureSlots(
    mesh,
    faces,
    angleDeg
  )
  const ends = emit(draw, liveIndices)
  const count = ends.length / 2
  const welded = ends.map((v) => weld.ids[v] ?? 0)
  const sides = new Int32Array(2 * count)
  let o = 0
  for (let s = 0; s < draw.length; s++) {
    if (draw[s] === 0) continue
    const j = Math.floor(s / 3)
    const k = neighbours[s] ?? -1
    const a = faceOf[live[j] ?? 0] ?? -1
    const b = k < 0 ? -1 : (faceOf[live[k] ?? 0] ?? -1)
    sides[o++] = Math.min(a, b)
    sides[o++] = Math.max(a, b)
  }
  return { ends, welded, faces: sides, weldedCount: weld.count }
}
