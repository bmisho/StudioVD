import type { PartId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { SlotMaterialRow } from "./SlotMaterialRow"

/**
 * Per-slot materials of a multi-material part (PLAN 6.1): each slot takes the part's material
 * unless it is given its own. Slot names come from the file (glTF/OBJ materials, STEP colours).
 */
export function SlotMaterials({ partId }: { partId: PartId }) {
  const slots = useDocumentStore((s) => {
    const part = Object.hasOwn(s.doc.parts, partId) ? s.doc.parts[partId] : undefined
    return part && Object.hasOwn(s.doc.assets, part.assetId)
      ? s.doc.assets[part.assetId]?.slots
      : undefined
  })
  if (!slots) return null
  return (
    <div className="flex flex-col gap-1.5">
      <h5 className="text-xs text-muted-foreground">Slots</h5>
      {slots.map((slot) => (
        <SlotMaterialRow key={slot} partId={partId} slot={slot} />
      ))}
    </div>
  )
}
