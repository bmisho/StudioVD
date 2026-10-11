import { BoxGeometry, type BufferGeometry } from "three"
import type { AssetId, GeometryAsset } from "@/core/schema"
import { ensureBoundsTree } from "../picking/bvh"

const cache = new Map<AssetId, BufferGeometry>()

/**
 * Phase 3 stand-in geometry: the asset's bounding box. Phase 4 keeps it as the Suspense
 * fallback while the GLB loads (and for a missing/corrupt asset file), so it is not throwaway.
 * Cached per content-addressed asset id: same asset, same GPU buffers.
 */
export function assetBoxGeometry(asset: GeometryAsset): BufferGeometry {
  const hit = cache.get(asset.id)
  if (hit) return hit
  const [x0, y0, z0] = asset.bboxMm.min
  const [x1, y1, z1] = asset.bboxMm.max
  const geometry = new BoxGeometry(x1 - x0, y1 - y0, z1 - z0)
  geometry.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
  ensureBoundsTree(geometry)
  cache.set(asset.id, geometry)
  return geometry
}
