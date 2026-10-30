import { useEffect, useSyncExternalStore } from "react"
import { Color, MeshBasicMaterial } from "three"
import type { GeometryAsset, Pose } from "@/core/schema"
import { assetBoxGeometry } from "@/features/viewport/parts/assetBoxGeometry"
import { assetCache } from "@/features/viewport/parts/assetCache"
import { noRaycast } from "@/features/viewport/picking/pickTarget"
import { useRedrawOnRemoval } from "@/features/viewport/renderer/useRedrawOnRemoval"
import { readSceneTokens } from "@/features/viewport/theme/sceneTokens"
import { OVERLAY } from "@/features/viewport/thumbnail/overlay"

let material: MeshBasicMaterial | null = null
/** See-through highlight, depth-tested so the ghost sits among the parts it meets. */
const ghostMaterial = () =>
  (material ??= new MeshBasicMaterial({
    color: new Color(readSceneTokens().highlight),
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    toneMapped: false,
  }))

/**
 * An asset drawn see-through at `pose` (a part's ghost for the Mate tool, a component being
 * inserted): its mesh, or its box while the mesh loads; never picked, left out of bounds and
 * thumbnails like the other overlays.
 */
export function GhostAsset({ asset, pose }: { asset: GeometryAsset; pose: Pose }) {
  const loaded = useSyncExternalStore(assetCache.subscribe, () => assetCache.getFor(asset))
  // Asked here too (the cache loads each asset once): not left to the part's own view.
  useEffect(() => assetCache.request(asset.id), [asset.id])
  useRedrawOnRemoval()
  // The shared box (cached per asset, like the part's own) until the mesh is in.
  const geometry = loaded?.geometry ?? assetBoxGeometry(asset)
  return (
    <mesh
      geometry={geometry}
      material={ghostMaterial()}
      position={pose.positionMm}
      quaternion={pose.quaternion}
      raycast={noRaycast}
      userData={OVERLAY}
    />
  )
}
