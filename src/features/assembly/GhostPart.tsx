import { useEffect, useMemo, useSyncExternalStore } from "react"
import { BoxGeometry, Color, MeshBasicMaterial } from "three"
import type { PartId, Pose } from "@/core/schema"
import { assetCache } from "@/features/viewport/parts/assetCache"
import { noRaycast } from "@/features/viewport/picking/pickTarget"
import { useRedrawOnRemoval } from "@/features/viewport/renderer/useRedrawOnRemoval"
import { readSceneTokens } from "@/features/viewport/theme/sceneTokens"
import { OVERLAY } from "@/features/viewport/thumbnail/overlay"
import { useDocumentStore } from "@/store/document/documentStore"

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
 * A part where the Mate tool would move it (PLAN 8.2 live preview): its mesh, or its box
 * while the mesh loads, at `pose`, see-through; never picked, left out of bounds and
 * thumbnails like the other overlays.
 */
export function GhostPart({ partId, pose }: { partId: PartId; pose: Pose }) {
  const asset = useDocumentStore((s) => {
    const part = Object.hasOwn(s.doc.parts, partId) ? s.doc.parts[partId] : undefined
    return part && Object.hasOwn(s.doc.assets, part.assetId)
      ? s.doc.assets[part.assetId]
      : undefined
  })
  const loaded = useSyncExternalStore(assetCache.subscribe, () =>
    asset ? assetCache.getFor(asset) : undefined
  )
  const box = useMemo(() => {
    if (!asset) return null
    const { min, max } = asset.bboxMm
    const geometry = new BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2])
    return geometry.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2)
  }, [asset])
  useEffect(() => () => box?.dispose(), [box])
  useRedrawOnRemoval()
  const geometry = loaded?.geometry ?? box
  if (!geometry) return null
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
