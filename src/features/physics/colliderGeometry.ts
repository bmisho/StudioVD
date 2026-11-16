import type { AssetId } from "@/core/schema"
import { assetCache } from "@/features/viewport/parts/assetCache"
import type { ColliderGeometry } from "./partColliders"

/** Each asset's convex hull vertices, kept from its first test run (a few dozen points). */
const hulls = new Map<string, Float32Array>()
/** Convex pieces per asset, as the decomposition (Rust, PLAN 10.2) returned them. */
const pieces = new Map<string, readonly Float32Array[]>()

const positions = (assetId: string): Float32Array | null => {
  const array = assetCache.get(assetId as AssetId)?.geometry.getAttribute("position").array
  return array instanceof Float32Array ? array : null
}

/**
 * Collider meshes for the app (PLAN 10.2): hulls and trimeshes from the assets the 3D view
 * has loaded, pieces from the decomposition cache. An asset still loading has none: its
 * parts collide as their boxes until the next run.
 */
export const appColliderGeometry: ColliderGeometry = {
  points: (assetId) => hulls.get(assetId) ?? positions(assetId),
  mesh: (assetId) => {
    const geometry = assetCache.get(assetId as AssetId)?.geometry
    const index = geometry?.getIndex()?.array
    const at = positions(assetId)
    return at && index instanceof Uint32Array ? { positions: at, indices: index } : null
  },
  pieces: (assetId) => pieces.get(assetId) ?? null,
  hullFound: (assetId, vertices) => void hulls.set(assetId, vertices.slice()),
}

export const colliderPieces = {
  has: (assetId: string): boolean => pieces.has(assetId),
  set: (assetId: string, value: readonly Float32Array[]): void => void pieces.set(assetId, value),
  /** Another document: content addresses still match, but free what it does not use. */
  retain: (ids: ReadonlySet<string>): void => {
    for (const id of pieces.keys()) if (!ids.has(id)) pieces.delete(id)
    for (const id of hulls.keys()) if (!ids.has(id)) hulls.delete(id)
  },
}
