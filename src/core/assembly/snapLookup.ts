import type { FaceInfo } from "@/core/geometry/meshData"
import type { SnapArc, SnapCorner, SnapFeatures, SnapLine } from "@/core/geometry/snapFeatures"
import { add, inPlane, length, scale, signedAngle, sub } from "@/core/math/vec3"
import type { Vec3 } from "@/core/schema"

// Lookups behind snapCandidate (PLAN 7.3): which face a triangle is on, what lies on a
// face's boundary, and where an arc passes nearest a point.

/** The face holding triangle `t` (faces are sorted, disjoint triangle ranges), or -1. */
export function faceOfTriangle(faces: readonly FaceInfo[], t: number): number {
  let lo = 0
  let hi = faces.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const f = faces[mid]
    if (!f) return -1
    if (t < f.first) hi = mid - 1
    else if (t > f.last) lo = mid + 1
    else return mid
  }
  return -1
}

export interface NearFace {
  corners: SnapCorner[]
  lines: SnapLine[]
  arcs: SnapArc[]
}
const byFace = new WeakMap<SnapFeatures, Map<number, NearFace>>()

/** The corners and edges on the boundary of each face, built once per feature set. */
export function nearFace(features: SnapFeatures, face: number): NearFace {
  let index = byFace.get(features)
  if (!index) {
    const map = new Map<number, NearFace>()
    const of = (f: number) => {
      let entry = map.get(f)
      if (!entry) map.set(f, (entry = { corners: [], lines: [], arcs: [] }))
      return entry
    }
    for (const c of features.corners) for (const f of c.faces) of(f).corners.push(c)
    for (const e of features.edges)
      for (const f of new Set(e.faces)) {
        if (f < 0) continue
        if (e.kind === "line") of(f).lines.push(e)
        else of(f).arcs.push(e)
      }
    byFace.set(features, (index = map))
  }
  return index.get(face) ?? { corners: [], lines: [], arcs: [] }
}

/** The point of an arc nearest `p` (round the circle): an end, beside the arc's missing part. */
export function nearestOnArc(a: SnapArc, p: Vec3): Vec3 {
  const radial = inPlane(sub(p, a.centre), a.axis)
  const l = length(radial)
  if (l < 1e-9) return a.start // at the centre, where every rim point is as near
  const onCircle = add(a.centre, scale(radial, a.radius / l))
  if (a.closed) return onCircle
  const turn = (v: Vec3) => {
    // From the start, the way the arc runs: [0, 2π).
    const t = Math.sign(a.sweep) * signedAngle(sub(a.start, a.centre), v, a.axis)
    return t < 0 ? t + 2 * Math.PI : t
  }
  const t = turn(radial)
  const sweep = Math.abs(a.sweep)
  if (t <= sweep) return onCircle
  return t - sweep < 2 * Math.PI - t ? a.end : a.start
}
