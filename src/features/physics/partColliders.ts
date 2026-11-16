import type * as Rapier from "@dimforge/rapier3d-compat"
import type { Collider, ColliderDesc, RigidBody, World } from "@dimforge/rapier3d-compat"
import type { PhysicsPartModel } from "@/core/physics/physicsModel"
import { add, rotate } from "@/core/math/vec3"
import type { Quat } from "@/core/schema"

/**
 * The meshes colliders are made from (PLAN 10.2), by asset: the app reads them from the
 * loaded assets and the decomposition cache; headless tests pass their own. Anything
 * missing falls back: pieces → hull → the asset's box.
 */
export interface ColliderGeometry {
  /** Part-local vertices (mm, xyz…) to wrap in a convex hull. */
  points: (assetId: string) => Float32Array | null
  /** The triangle mesh, for a grounded part's exact (hollow) collider. */
  mesh: (assetId: string) => { positions: Float32Array; indices: Uint32Array } | null
  /** Convex pieces (each a vertex list) from the decomposition, once it is there. */
  pieces: (assetId: string) => readonly Float32Array[] | null
  /** Told the hull's own vertices once computed, so the next run starts from those few. */
  hullFound?: (assetId: string, vertices: Float32Array) => void
}

export const NO_GEOMETRY: ColliderGeometry = {
  points: () => null,
  mesh: () => null,
  pieces: () => null,
}

/** Thinnest box half-extent (mm): Rapier needs a volume, a flat import has none. */
const MIN_HALF_MM = 0.005
const q = (a: Quat) => ({ x: a[0], y: a[1], z: a[2], w: a[3] })

type Api = Pick<typeof Rapier, "ColliderDesc">

function shapes(rapier: Api, part: PhysicsPartModel, geometry: ColliderGeometry): ColliderDesc[] {
  const { ColliderDesc } = rapier
  const hull = () => {
    const points = geometry.points(part.assetId)
    const desc = points && points.length >= 12 ? ColliderDesc.convexHull(points) : null
    const shape: object | undefined = desc?.shape
    if (shape && "vertices" in shape && shape.vertices instanceof Float32Array)
      geometry.hullFound?.(part.assetId, shape.vertices)
    return desc ? [desc] : null
  }
  if (part.collider === "decomposed") {
    const pieces = (geometry.pieces(part.assetId) ?? []).flatMap((points) => {
      const desc = points.length >= 12 ? ColliderDesc.convexHull(points) : null
      return desc ? [desc] : []
    })
    if (pieces.length > 0) return pieces
  }
  if (part.collider === "trimesh") {
    const mesh = geometry.mesh(part.assetId)
    if (mesh && mesh.indices.length >= 3)
      return [ColliderDesc.trimesh(mesh.positions, mesh.indices)]
  }
  if (part.collider === "hull" || part.collider === "decomposed" || part.collider === "trimesh")
    return hull() ?? []
  return []
}

/**
 * The part's colliders on `body` (PLAN 10.2): its shape in part-local coordinates, placed by
 * the part's offset and design rotation (the body itself starts unrotated). The part's mass
 * is shared among them by volume; a part that collides with nothing (`none`) keeps a box in
 * no collision group, so it still has its mass.
 */
export function createPartColliders(
  rapier: Api,
  world: World,
  body: RigidBody,
  part: PhysicsPartModel,
  geometry: ColliderGeometry
): Collider[] {
  const descs = shapes(rapier, part, geometry)
  for (const d of descs) d.setTranslation(...part.offsetMm).setRotation(q(part.rotation))
  if (descs.length === 0) {
    const [hx, hy, hz] = part.box.halfExtentsMm.map((h) => Math.max(h, MIN_HALF_MM))
    const box = rapier.ColliderDesc.cuboid(hx ?? MIN_HALF_MM, hy ?? MIN_HALF_MM, hz ?? MIN_HALF_MM)
      .setTranslation(...add(part.offsetMm, rotate(part.rotation, part.box.centerMm)))
      .setRotation(q(part.rotation))
    if (part.collider === "none") box.setCollisionGroups(0) // member of no group
    descs.push(box)
  }
  const colliders = descs.map((d) => world.createCollider(d.setDensity(1), body))
  const volumes = colliders.map((c) => Math.max(c.volume(), 0))
  const total = volumes.reduce((s, v) => s + v, 0)
  colliders.forEach((c, i) => {
    // A trimesh has no volume: on a fixed body its mass does not matter.
    const share = total > 0 ? (volumes[i] ?? 0) / total : i === 0 ? 1 : 0
    c.setMass(part.massKg * share)
  })
  return colliders
}
