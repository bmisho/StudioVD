import { Box3, Matrix4, Quaternion, Triangle, Vector3, type BufferGeometry } from "three"
import type { HitPointInfo } from "three-mesh-bvh"
import type { ClearPoint } from "@/core/connectors/cableClearance"
import type { SceneDocument, Vec3 } from "@/core/schema"
import { ensureBoundsTree } from "../picking/bvh"
import { assetCache } from "./assetCache"

/** How far past a surface a pushed point lands (mm): clear of it, not on it. */
const MARGIN = 0.15

interface Obstacle {
  geometry: BufferGeometry
  toWorld: Matrix4
  toLocal: Matrix4
  /** World bounds, for skipping parts a point is nowhere near. */
  box: Box3
}

const v = new Vector3()
const n = new Vector3()
const tri = new Triangle()
const hit: HitPointInfo = { point: new Vector3(), distance: 0, faceIndex: 0 }

/** The outward normal of a hit's face: its winding, checked against the stored normals. */
function faceNormal(g: BufferGeometry, face: number, out: Vector3): Vector3 {
  const index = g.getIndex()
  const pos = g.getAttribute("position")
  const at = (k: number) => index?.getX(3 * face + k) ?? 3 * face + k
  tri.setFromAttributeAndIndices(pos, at(0), at(1), at(2)).getNormal(out)
  const stored = g.getAttribute("normal")
  if (stored && out.dot(v.fromBufferAttribute(stored, at(0))) < 0) out.negate()
  return out
}

/**
 * Every visible part with its loaded mesh, as obstacles for cables (0.2.2): `clear` moves a
 * point that is inside a part, or nearer its surface than a cable's radius, out along the
 * surface's normal. Parts still drawn as their box (not loaded) are left out.
 */
export function partObstacles(doc: Pick<SceneDocument, "parts" | "assets">): ClearPoint {
  const obstacles: Obstacle[] = []
  for (const part of Object.values(doc.parts)) {
    const asset =
      part.visible && Object.hasOwn(doc.assets, part.assetId) ? doc.assets[part.assetId] : null
    const geometry = asset ? assetCache.getFor(asset)?.geometry : undefined
    if (!geometry) continue
    ensureBoundsTree(geometry)
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    const toWorld = new Matrix4().compose(
      new Vector3(...part.pose.positionMm),
      new Quaternion(...part.pose.quaternion),
      new Vector3(1, 1, 1)
    )
    const box = (geometry.boundingBox ?? new Box3()).clone().applyMatrix4(toWorld)
    obstacles.push({ geometry, toWorld, toLocal: toWorld.clone().invert(), box })
  }
  return (p: Vec3, radius: number): Vec3 | null => {
    let moved = false
    const at = new Vector3(...p)
    for (const o of obstacles) {
      if (o.box.distanceToPoint(at) > radius) continue
      const local = v.copy(at).applyMatrix4(o.toLocal).clone()
      const found = o.geometry.boundsTree?.closestPointToPoint(local, hit)
      if (!found) continue
      faceNormal(o.geometry, found.faceIndex, n)
      const away = local.clone().sub(found.point)
      const inside = away.dot(n) < 0
      if (!inside && found.distance >= radius) continue
      const dir = inside || found.distance < 1e-9 ? n : away.normalize()
      at.copy(found.point)
        .addScaledVector(dir, radius + MARGIN)
        .applyMatrix4(o.toWorld)
      moved = true
    }
    return moved ? [at.x, at.y, at.z] : null
  }
}
