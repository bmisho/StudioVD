import { useId } from "react"
import type { PartId, SceneDocument } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { MaterialSelect } from "./MaterialSelect"

const partOf = (doc: SceneDocument, id: PartId) =>
  Object.hasOwn(doc.parts, id) ? doc.parts[id] : undefined

function SlotRow({ partId, slot }: { partId: PartId; slot: string }) {
  const id = useId()
  const value = useDocumentStore(
    (s) => partOf(s.doc, partId)?.materialSlots?.find((m) => m.slot === slot)?.materialId ?? null
  )
  const setSlotMaterial = useDocumentStore((s) => s.setSlotMaterial)
  return (
    <div className="grid grid-cols-[minmax(0,6rem)_minmax(0,1fr)] items-center gap-2">
      <label htmlFor={id} className="truncate text-xs" title={slot}>
        {slot}
      </label>
      <MaterialSelect
        id={id}
        value={value}
        noneLabel="Part material"
        onChange={(m) => setSlotMaterial(partId, slot, m)}
      />
    </div>
  )
}

/**
 * Per-slot materials of a multi-material part (PLAN 6.1): each slot takes the part's material
 * unless it is given its own. Slot names come from the file (glTF/OBJ materials, STEP colours).
 */
export function SlotMaterials({ partId }: { partId: PartId }) {
  const slots = useDocumentStore((s) => {
    const part = partOf(s.doc, partId)
    return part && Object.hasOwn(s.doc.assets, part.assetId)
      ? s.doc.assets[part.assetId]?.slots
      : undefined
  })
  if (!slots) return null
  return (
    <div className="flex flex-col gap-1.5">
      <h5 className="text-xs text-muted-foreground">Slots</h5>
      {slots.map((slot) => (
        <SlotRow key={slot} partId={partId} slot={slot} />
      ))}
    </div>
  )
}
