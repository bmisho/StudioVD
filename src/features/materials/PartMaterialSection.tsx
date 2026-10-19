import { useId } from "react"
import type { MaterialId, PartId, SceneDocument } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { MaterialSelect } from "./MaterialSelect"
import { SlotMaterials } from "./SlotMaterials"

/** The parts' common material id, null for none, undefined when they differ. */
function sharedMaterial(doc: SceneDocument, partIds: readonly PartId[]) {
  let shared: MaterialId | null | undefined
  for (const [i, id] of partIds.entries()) {
    const m = Object.hasOwn(doc.parts, id) ? (doc.parts[id]?.materialId ?? null) : null
    if (i === 0) shared = m
    else if (m !== shared) return undefined
  }
  return shared
}

/**
 * Material of the selected parts (PLAN 6.3, 6.4): pick one of the project's materials or a
 * built-in preset for all of them, edit it, and (one part) give its slots their own.
 */
export function PartMaterialSection({ partIds }: { partIds: readonly PartId[] }) {
  const id = useId()
  const materialId = useDocumentStore((s) => sharedMaterial(s.doc, partIds))
  const assign = useDocumentStore((s) => s.assignMaterial)
  const single = partIds.length === 1 ? partIds[0] : undefined
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-2">
      <h4 id={`${id}-title`} className="text-xs font-semibold">
        Material
      </h4>
      <MaterialSelect
        id={id}
        label="Material"
        value={materialId}
        noneLabel="Imported colours"
        onChange={(m) => assign(partIds, m)}
      />
      {single && <SlotMaterials partId={single} />}
    </section>
  )
}
