import { useEffect, useSyncExternalStore } from "react"
import type { BufferGeometry } from "three"
import type { AssetSlot } from "@/core/geometry/slots"
import type { GeometryAsset } from "@/core/schema"
import { assetBoxGeometry } from "./assetBoxGeometry"
import { assetCache } from "./assetCache"

export interface AssetDisplay {
  geometry: BufferGeometry
  slots: readonly AssetSlot[] | null
  edges: BufferGeometry | null
  /** No feature edges will come (a bounding box, or edges that failed): wireframe keeps faces. */
  edgeless: boolean
}

/**
 * What a part draws: its loaded mesh, material slots and (when `withEdges`) feature edges, or
 * its bounding box until the mesh is in (no slots, no edges), or for good if the file is
 * missing, broken or not what the project lists.
 */
export function useAssetDisplay(asset: GeometryAsset, withEdges: boolean): AssetDisplay {
  const loaded = useSyncExternalStore(assetCache.subscribe, () => assetCache.getFor(asset))
  const edges = useSyncExternalStore(assetCache.subscribe, () => assetCache.edges(asset.id))
  const edgesFailed = useSyncExternalStore(assetCache.subscribe, () =>
    assetCache.edgesFailed(asset.id)
  )
  useEffect(() => assetCache.request(asset.id), [asset.id])
  useEffect(() => {
    if (withEdges && loaded) assetCache.requestEdges(asset.id)
  }, [asset.id, withEdges, loaded])
  return {
    geometry: loaded?.geometry ?? assetBoxGeometry(asset),
    slots: loaded?.slots ?? null,
    edges: withEdges && loaded ? (edges ?? null) : null,
    edgeless: !loaded || edgesFailed,
  }
}
