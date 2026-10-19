import { useId } from "react"
import { Button } from "@/components/ui/button"
import type { MaterialId, PartId, SceneDocument } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { MaterialEditor } from "./MaterialEditor"
import { MaterialSelect } from "./MaterialSelect"
import { PresetGrid } from "./PresetGrid"
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
 * built-in preset for all of them, or start a new one; edit the material they share; give a
 * single part's slots their own.
 */
export function PartMaterialSection({ partIds }: { partIds: readonly PartId[] }) {
  const id = useId()
  const materialId = useDocumentStore((s) => sharedMaterial(s.doc, partIds))
  const assign = useDocumentStore((s) => s.assignMaterial)
  const create = useDocumentStore((s) => s.createMaterial)
  const single = partIds.length === 1 ? partIds[0] : undefined
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-2">
      <h4 id={`${id}-title`} className="text-xs font-semibold">
        Material
      </h4>
      <div className="flex gap-1.5">
        <MaterialSelect
          id={id}
          label="Material"
          value={materialId}
          noneLabel="Imported colours"
          onChange={(m) => assign(partIds, m)}
        />
        <Button
          variant="outline"
          size="sm"
          className="h-7 shrink-0 text-xs"
          title="A new material for the selected parts"
          onClick={() => create(partIds)}
        >
          New
        </Button>
      </div>
      <PresetGrid partIds={partIds} />
      {materialId && <MaterialEditor materialId={materialId} partIds={partIds} />}
      {single && <SlotMaterials partId={single} />}
    </section>
  )
}
