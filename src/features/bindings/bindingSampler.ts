import { Matrix4, Quaternion, Raycaster, Vector3 } from "three"
import { sampleBindings, type Injected, type Live } from "@/core/bindings/sample"
import { boxesTouch } from "@/core/bindings/touch"
import { physicsModelFromDocument } from "@/core/physics/physicsModel"
import type { PartId, Pose, SceneDocument } from "@/core/schema"
import { contactReadings } from "@/features/physics/contactReadings"
import { jointReadings } from "@/features/physics/jointReadings"
import { partObject } from "@/features/viewport/parts/partObjects"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"

// The live side of bindings (PLAN 13.4): what 3D measures now, read from the parts as drawn
// (their design pose, or where test mode has them), the joints' live coordinates and the
// physics contacts; turned into the solver's inputs by the pure sampler.

const raycaster = new Raycaster()
const m = new Matrix4()

/** A part's pose as drawn now (mm): its scene object's world transform. */
function drawnPose(doc: SceneDocument, id: PartId): Pose | undefined {
  const object = partObject(id)
  if (!object) return Object.hasOwn(doc.parts, id) ? doc.parts[id]?.pose : undefined
  object.updateWorldMatrix(true, false)
  const p = new Vector3()
  const q = new Quaternion()
  m.copy(object.matrixWorld).decompose(p, q, new Vector3())
  return { positionMm: [p.x, p.y, p.z], quaternion: [q.x, q.y, q.z, q.w] }
}

export function liveOf(doc: SceneDocument): Live {
  const testMode = useSessionStore.getState().testMode
  return {
    pose: (id) => drawnPose(doc, id),
    reading: (mate) => (testMode ? jointReadings.get(mate) : undefined),
    touching: (a, b) =>
      testMode && contactReadings.known(a, b)
        ? contactReadings.touching(a, b)
        : boxesTouch(doc, a, b, (id) => drawnPose(doc, id)),
    ray: (origin, dir, maxMm, skip) => {
      raycaster.set(new Vector3(...origin), new Vector3(...dir))
      raycaster.far = maxMm
      let best: number | null = null
      for (const p of Object.values(doc.parts)) {
        if (skip.includes(p.id)) continue
        const object = partObject(p.id)
        if (!object) continue
        for (const hit of raycaster.intersectObject(object, true))
          if (!hit.object.userData.overlay && (best === null || hit.distance < best))
            best = hit.distance
      }
      return best
    },
  }
}

/** The solver's inputs from the bindings, now. */
export function sampleNow(): Injected {
  const { doc } = useDocumentStore.getState()
  if (Object.keys(doc.bindings).length === 0) return { params: {}, signals: {}, light: {} }
  const masses = new Map(
    physicsModelFromDocument(doc).bodies.flatMap((b) =>
      b.parts.map((p) => [p.partId as string, p.massKg])
    )
  )
  return sampleBindings(doc, liveOf(doc), (id) => masses.get(id) ?? 0)
}
