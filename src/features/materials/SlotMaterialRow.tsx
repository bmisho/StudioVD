import { useId } from "react"
import type { PartId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { MaterialSelect } from "./MaterialSelect"

/** One slot of a part: its own material, or none (the part's material shows). */
export function SlotMaterialRow({ partId, slot }: { partId: PartId; slot: string }) {
  const id = useId()
  const value = useDocumentStore((s) => {
    const part = Object.hasOwn(s.doc.parts, partId) ? s.doc.parts[partId] : undefined
    return part?.materialSlots?.find((m) => m.slot === slot)?.materialId ?? null
  })
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
