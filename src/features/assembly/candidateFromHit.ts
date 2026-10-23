import type { RootState } from "@react-three/fiber"
import { Matrix4, Vector3, type Intersection } from "three"
import { snapCandidate } from "@/core/assembly/snapCandidates"
import { normalize, sub } from "@/core/math/vec3"
import type { Vec3 } from "@/core/schema"
import { assetCache } from "@/features/viewport/parts/assetCache"
import { partObject } from "@/features/viewport/parts/partObjects"
import { pickRefOf } from "@/features/viewport/picking/pickTarget"
import { useDocumentStore } from "@/store/document/documentStore"
import type { AnchorPreview } from "./anchorPreview"

const toLocal = new Matrix4()
const v = new Vector3()
const tuple = (p: Vector3): Vec3 => [p.x, p.y, p.z]

/**
 * The anchor the cursor would place on the part under it (PLAN 7.2, 7.3), from the raycast
 * hit: part-local point, triangle and normal, the part's faces and (once the asset worker
 * has them) its snap features. Null when the hit is not on a part.
 */
export function candidateFromHit(
  hit: Intersection,
  cursor: { x: number; y: number },
  state: RootState
): AnchorPreview | null {
  const item = pickRefOf(hit.object)
  if (item?.kind !== "part") return null
  const doc = useDocumentStore.getState().doc
  const part = Object.hasOwn(doc.parts, item.id) ? doc.parts[item.id] : undefined
  const asset = part && Object.hasOwn(doc.assets, part.assetId) ? doc.assets[part.assetId] : null
  const object = partObject(item.id)
  if (!part || !asset || !object) return null
  const loaded = assetCache.getFor(asset)
  if (loaded) assetCache.requestSnaps(asset.id)

  object.updateWorldMatrix(true, false)
  toLocal.copy(object.matrixWorld).invert()
  const point = tuple(v.copy(hit.point).applyMatrix4(toLocal))
  const camera = tuple(state.camera.getWorldPosition(v).applyMatrix4(toLocal))
  const rect = state.gl.domElement.getBoundingClientRect()
  const toScreen = (p: Vec3) => {
    v.set(...p)
      .applyMatrix4(object.matrixWorld)
      .project(state.camera)
    return {
      x: rect.left + ((v.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - v.y) / 2) * rect.height,
    }
  }
  const normal = hit.face?.normal
  const candidate = snapCandidate({
    point,
    normal: normal ? [normal.x, normal.y, normal.z] : normalize(sub(camera, point)),
    triangle: hit.faceIndex ?? -1,
    toViewer: normalize(sub(camera, point)),
    faces: loaded?.faces ?? [],
    features: (loaded && assetCache.snaps(asset.id)) ?? null,
    toScreen,
    cursor,
  })
  return { partId: part.id, candidate }
}
