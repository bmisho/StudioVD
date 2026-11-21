import { Pencil, Trash2 } from "lucide-react"
import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { describeSource, describeTarget } from "@/core/bindings/describe"
import { bindingRefs } from "@/core/schema/binding"
import { useBindingEditor, type BindingEditorState } from "@/features/bindings/bindingEditorStore"
import { useDocumentStore } from "@/store/document/documentStore"

/** Bindings that name an entity (PLAN 13.3): each said in words, editable and removable. */
export function BindingsSection({
  entity,
  preset,
}: {
  entity: string
  /** What a new binding from here starts with. */
  preset: NonNullable<BindingEditorState["open"]>
}) {
  const doc = useDocumentStore((s) => s.doc)
  const remove = useDocumentStore((s) => s.deleteBindings)
  const show = useBindingEditor((s) => s.show)
  const mine = useMemo(
    () => Object.values(doc.bindings).filter((b) => bindingRefs(b).includes(entity)),
    [doc.bindings, entity]
  )
  return (
    <section aria-label="Bindings" className="flex flex-col gap-1">
      <h3 className="text-xs font-medium text-muted-foreground">Bindings</h3>
      {mine.map((b) => (
        <div key={b.id} className="flex items-center gap-1 text-xs">
          <span
            className="min-w-0 flex-1 truncate"
            title={`${describeSource(doc, b)} → ${describeTarget(doc, b)}`}
          >
            {describeSource(doc, b)} → {describeTarget(doc, b)}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="size-6"
            aria-label="Edit binding"
            onClick={() => show({ editing: b.id })}
          >
            <Pencil className="size-3.5" aria-hidden />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-6"
            aria-label="Remove binding"
            onClick={() => remove([b.id])}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        className="h-7 self-start text-xs"
        onClick={() => show(preset)}
      >
        Bind…
      </Button>
    </section>
  )
}
