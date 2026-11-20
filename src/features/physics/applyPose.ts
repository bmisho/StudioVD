import { settlePoses } from "@/core/physics/settlePoses"
import type { PartId, Pose } from "@/core/schema"
import { partObject } from "@/features/viewport/parts/partObjects"
import type { DocumentStore } from "@/store/document/documentStore"
import type { SessionStore } from "@/store/session/sessionStore"

/** Where every drawn part is now: test mode writes the live poses into their scene objects. */
export function livePoses(ids: readonly PartId[]): Map<PartId, Pose> {
  const poses = new Map<PartId, Pose>()
  for (const id of ids) {
    const object = partObject(id)
    if (!object) continue
    const { position: p, quaternion: q } = object
    poses.set(id, { positionMm: [p.x, p.y, p.z], quaternion: [q.x, q.y, q.z, q.w] })
  }
  return poses
}

/**
 * Test mode › Apply Pose (PLAN 10.7): the tested pose becomes the design pose, ONE undo entry,
 * and test mode ends. Joints keep their readings and the solver's few µm across them are
 * snapped out (`settlePoses`), so every mate still holds. Returns how many parts moved.
 */
export function applyTestPose(document: DocumentStore, session: SessionStore): number {
  if (!session.getState().testMode) return 0
  const { doc } = document.getState()
  const live = livePoses(Object.values(doc.parts).flatMap((p) => (p.visible ? [p.id] : [])))
  const poses = settlePoses(doc, live)
  if (poses.size > 0) document.getState().setPartPoses(poses)
  session.getState().toggleTestMode()
  return poses.size
}
