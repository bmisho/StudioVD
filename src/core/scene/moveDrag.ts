import { mateAdjacency } from "@/core/assembly/mateSides"
import { add, dot, normalize, scale, sub } from "@/core/math/vec3"
import {
  MAX_COORDINATE_MM,
  type PartId,
  type Pose,
  type SceneDocument,
  type Vec3,
} from "@/core/schema"
import { partsInSelection } from "./partsInSelection"
import type { SelectionRef } from "./selection"

type Doc = Pick<SceneDocument, "groups" | "parts" | "anchors" | "mates">

/**
 * What a drag in the 3D view moves (design mode): the grabbed part, or every part of the
 * grabbed group (a library component), plus everything mated to them, so no mate is pulled
 * apart. Grounded parts move too: grounding fixes a part in test mode, not in the design.
 */
export function partsToMove(doc: Doc, target: SelectionRef): PartId[] {
  const start = [...partsInSelection(doc, [target])]
  const next = mateAdjacency(doc)
  const seen = new Set<PartId>(start)
  const queue = [...start]
  for (let i = 0; i < queue.length; i++)
    for (const other of next.get(queue[i] as PartId) ?? [])
      if (!seen.has(other)) {
        seen.add(other)
        queue.push(other)
      }
  return queue
}

/** A plane through `point` with unit `normal`. */
export interface DragPlane {
  point: Vec3
  normal: Vec3
}

/**
 * The plane a drag slides in: level through the grab point (along the ground), or, with
 * `vertical`, upright through it and facing the camera as far as an upright plane can, so
 * the part rises and falls under the cursor.
 */
export function dragPlane(grab: Vec3, viewDir: Vec3, vertical: boolean): DragPlane {
  if (!vertical) return { point: grab, normal: [0, 1, 0] }
  const flat: Vec3 = [viewDir[0], 0, viewDir[2]]
  // Looking straight down: any upright plane through the point will do; face +Z.
  const normal = Math.hypot(flat[0], flat[2]) < 1e-6 ? ([0, 0, 1] as Vec3) : normalize(flat)
  return { point: grab, normal }
}

/** Where a ray meets the plane, or null when it runs along it or points away. */
export function rayOnPlane(origin: Vec3, dir: Vec3, plane: DragPlane): Vec3 | null {
  const along = dot(dir, plane.normal)
  if (Math.abs(along) < 1e-9) return null
  const t = dot(sub(plane.point, origin), plane.normal) / along
  return t > 0 ? add(origin, scale(dir, t)) : null
}

/** Each moved part's design pose shifted by `delta` (mm); null past the coordinate limit. */
export function movedPoses(
  doc: Pick<SceneDocument, "parts">,
  parts: readonly PartId[],
  delta: Vec3
): Map<PartId, Pose> | null {
  const out = new Map<PartId, Pose>()
  for (const id of parts) {
    const part = Object.hasOwn(doc.parts, id) ? doc.parts[id] : undefined
    if (!part) continue
    const positionMm = add(part.pose.positionMm, delta)
    if (!positionMm.every((v) => Math.abs(v) <= MAX_COORDINATE_MM)) return null
    out.set(id, { positionMm, quaternion: part.pose.quaternion })
  }
  return out
}
