import type { PartId, Pose } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { GhostAsset } from "./GhostAsset"

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
  return asset ? <GhostAsset asset={asset} pose={pose} /> : null
}
