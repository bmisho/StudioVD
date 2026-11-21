import { useMemo } from "react"
import { openSlots } from "@/core/library/instantiateBindings"
import type { ComponentInstanceId, PartId } from "@/core/schema"
import { PickSelect } from "@/features/bindings/PickSelect"
import { partOptions } from "@/features/bindings/pickerOptions"
import { toastNotifier } from "@/lib/notify"
import { useDocumentStore } from "@/store/document/documentStore"

/** What a component still needs from outside it (PLAN 13.2): a part for each slot. */
export function ComponentSlots({ instance }: { instance: ComponentInstanceId }) {
  const doc = useDocumentStore((s) => s.doc)
  const fill = useDocumentStore((s) => s.fillComponentSlot)
  const c = doc.components[instance]
  const def = c?.def ? doc.componentDefs[c.def] : undefined
  const slots = useMemo(() => openSlots(def?.manifest, c?.bindings ?? {}), [def, c])
  const options = useMemo(
    () =>
      partOptions(doc).filter((o) => !Object.values(c?.parts ?? {}).includes(o.value as PartId)),
    [doc, c]
  )
  if (!c || slots.length === 0) return null
  return (
    <section aria-label="Needs" className="flex flex-col gap-1">
      <h4 className="text-xs font-medium text-warning">Needs</h4>
      {slots.map((t) => (
        <PickSelect
          key={t.key}
          label={t.from.kind === "contactSlot" ? t.from.slot : t.key}
          value={undefined}
          options={options}
          onChange={(part) => {
            const why = fill(instance, t.key, part as PartId)
            if (why) toastNotifier.warning("Not bound", why)
          }}
        />
      ))}
    </section>
  )
}
