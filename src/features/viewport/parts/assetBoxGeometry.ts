import { BoxGeometry, type BufferGeometry } from "three"
import type { AssetId, GeometryAsset } from "@/core/schema"
import { ensureBoundsTree } from "../picking/bvh"

const cache = new Map<AssetId, BufferGeometry>()

/**
 * The asset's bounding box: drawn while the GLB loads, for a missing or broken asset file,
 * and for the test rig's placeholder assets.
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
