import { compose, fromPose, invert, toPose, type Rigid } from "@/core/math/rigid"
import { MAX_COORDINATE_MM, type PartId, type Pose, type SceneDocument } from "@/core/schema"
import { partsToMove } from "./moveDrag"
import type { SelectionRef } from "./selection"

type Doc = Pick<SceneDocument, "groups" | "parts" | "anchors" | "mates">

/**
 * What the selection gizmo moves (0.2.2): every part the selection covers (directly or through
 * a group, a whole assembly included) and everything mated to them, so no mate is pulled apart.
 */
export function partsOfSelection(doc: Doc, selection: readonly SelectionRef[]): PartId[] {
  const out = new Set<PartId>()
  for (const item of selection)
    if (item.kind === "part" || item.kind === "group")
      for (const id of partsToMove(doc, item)) out.add(id)
  return [...out]
}

/**
 * Each part's design pose after the gizmo's pivot went from `from` to `to`: the same rigid
 * motion applied to all of them (they keep their places relative to each other). Null when a
 * part would leave the coordinate range the file format allows.
 */
export function movedWithPivot(
  doc: Pick<SceneDocument, "parts">,
  parts: readonly PartId[],
  from: Rigid,
  to: Rigid
): Map<PartId, Pose> | null {
  const motion = compose(to, invert(from))
  const out = new Map<PartId, Pose>()
  for (const id of parts) {
    const part = Object.hasOwn(doc.parts, id) ? doc.parts[id] : undefined
    if (!part) continue
    const pose = toPose(compose(motion, fromPose(part.pose)))
    if (!pose.positionMm.every((v) => Math.abs(v) <= MAX_COORDINATE_MM)) return null
    out.set(id, pose)
  }
  return out
}
