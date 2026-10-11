import { useEffect, useSyncExternalStore } from "react"
import type { BufferGeometry, Material } from "three"
import type { GeometryAsset } from "@/core/schema"
import { assetBoxGeometry } from "./assetBoxGeometry"
import { assetCache } from "./assetCache"
import { defaultPartMaterial } from "./defaultPartMaterial"

/** What a part draws: its loaded mesh and source colours, or its bounding box until then. */
export function useAssetDisplay(asset: GeometryAsset): {
  geometry: BufferGeometry
  material: Material
} {
  const loaded = useSyncExternalStore(assetCache.subscribe, () => assetCache.get(asset.id))
  useEffect(() => assetCache.request(asset.id), [asset.id])
  return {
    geometry: loaded?.geometry ?? assetBoxGeometry(asset),
    material: loaded?.material ?? defaultPartMaterial(),
  }
}
