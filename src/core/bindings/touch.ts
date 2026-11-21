import { add, cross, dot, rotate, sub } from "@/core/math/vec3"
import type { PartId, Pose, SceneDocument, Vec3 } from "@/core/schema"

// Whether two parts touch at the poses drawn now (PLAN 13.1 contact source), outside test
// mode: their bounding boxes (oriented with the parts) overlap or come within `gapMm`. Test
// mode reads Rapier's contacts instead, which follow the real shapes.

/** Closer than this counts as touching (a switch's lever resting on a cam). */
export const TOUCH_GAP_MM = 0.5

interface Obb {
  centre: Vec3
  axes: [Vec3, Vec3, Vec3]
  half: Vec3
}

function obbOf(doc: Pick<SceneDocument, "parts" | "assets">, id: PartId, pose: Pose): Obb | null {
  const part = Object.hasOwn(doc.parts, id) ? doc.parts[id] : undefined
  const asset =
    part && Object.hasOwn(doc.assets, part.assetId) ? doc.assets[part.assetId] : undefined
  if (!asset) return null
  const { min, max } = asset.bboxMm
  const localCentre: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  const q = pose.quaternion
  return {
    centre: add(pose.positionMm, rotate(q, localCentre)),
    axes: [rotate(q, [1, 0, 0]), rotate(q, [0, 1, 0]), rotate(q, [0, 0, 1])],
    half: [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2],
  }
}

/** Separating-axis test for two oriented boxes, each grown by half the gap. */
export function obbsTouch(a: Obb, b: Obb, gapMm: number): boolean {
  const d = sub(b.centre, a.centre)
  const axes: Vec3[] = [...a.axes, ...b.axes]
  for (const u of a.axes)
    for (const v of b.axes) {
      const c = cross(u, v)
      if (dot(c, c) > 1e-12) axes.push(c)
    }
  for (const axis of axes) {
    const len = Math.sqrt(dot(axis, axis))
    const n: Vec3 = [axis[0] / len, axis[1] / len, axis[2] / len]
    const ra = a.axes.reduce((s, u, i) => s + (a.half[i] ?? 0) * Math.abs(dot(u, n)), 0)
    const rb = b.axes.reduce((s, u, i) => s + (b.half[i] ?? 0) * Math.abs(dot(u, n)), 0)
    if (Math.abs(dot(d, n)) > ra + rb + gapMm) return false
  }
  return true
}

export function boxesTouch(
  doc: Pick<SceneDocument, "parts" | "assets">,
  a: PartId,
  b: PartId,
  pose: (id: PartId) => Pose | undefined,
  gapMm = TOUCH_GAP_MM
): boolean {
  const [pa, pb] = [pose(a), pose(b)]
  const [oa, ob] = [pa && obbOf(doc, a, pa), pb && obbOf(doc, b, pb)]
  return !!oa && !!ob && obbsTouch(oa, ob, gapMm)
}
