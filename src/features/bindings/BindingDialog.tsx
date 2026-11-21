import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { describeSource, describeTarget } from "@/core/bindings/describe"
import type { BindingSource, BindingTarget, SceneDocument } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useBindingEditor, type BindingEditorState } from "./bindingEditorStore"
import { SOURCE_KINDS, targetKindsFor, type Draft } from "./bindingKinds"
import { MappingFields, type Mapping } from "./MappingFields"
import { SourceFields } from "./SourceFields"
import { TargetFields } from "./TargetFields"

type Preset = NonNullable<BindingEditorState["open"]>

function BindingForm({
  doc,
  preset,
  close,
}: {
  doc: SceneDocument
  preset: Preset
  close: () => void
}) {
  const editing = preset.editing !== undefined ? doc.bindings[preset.editing] : undefined
  const [from, setFrom] = useState<Draft>(
    () =>
      editing?.from ??
      preset.from ?? {
        kind:
          preset.to?.kind === "glow" || preset.to?.kind === "tint" ? "output" : "mateCoordinate",
      }
  )
  const [to, setTo] = useState<Draft>(
    () => editing?.to ?? preset.to ?? { kind: targetKindsFor(from.kind)[0] ?? "param" }
  )
  const [mapping, setMapping] = useState<Mapping>(() => ({
    scale: editing?.scale ?? 1,
    offset: editing?.offset ?? 0,
    min: editing?.min,
    max: editing?.max,
  }))
  const [refusal, setRefusal] = useState<string | null>(null)
  const add = useDocumentStore((s) => s.addBinding)
  const update = useDocumentStore((s) => s.updateBinding)
  const targets = targetKindsFor(from.kind)
  const changeFrom = (d: Draft) => {
    setFrom(d)
    if (!targetKindsFor(d.kind).includes(to.kind))
      setTo({ kind: targetKindsFor(d.kind)[0] ?? "param" })
  }
  const apply = () => {
    const m = { scale: mapping.scale ?? 1, offset: mapping.offset ?? 0 }
    if (editing) {
      update(editing.id, { ...m, min: mapping.min ?? null, max: mapping.max ?? null })
      close()
      return
    }
    const result = add({
      from: (from.kind === "light" ? { halfAngle: Math.PI / 6, ...from } : from) as BindingSource,
      to: (to.kind === "glow"
        ? { color: "red", ...to }
        : to.kind === "label"
          ? { unit: "", ...to }
          : to) as BindingTarget,
      ...m,
      ...(mapping.min !== undefined && { min: mapping.min }),
      ...(mapping.max !== undefined && { max: mapping.max }),
    })
    if (result.ok) close()
    else setRefusal(result.reason)
  }
  return (
    <>
      <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
        {editing ? (
          <p className="text-xs">
            {describeSource(doc, editing)} → {describeTarget(doc, editing)}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <SourceFields
              doc={doc}
              draft={from}
              onChange={changeFrom}
              kinds={SOURCE_KINDS.map(([k]) => k)}
            />
            <TargetFields
              doc={doc}
              draft={to}
              onChange={setTo}
              kinds={targets}
              light={from.kind === "light"}
            />
          </div>
        )}
        <MappingFields mapping={mapping} onChange={setMapping} />
      </div>
      <DialogFooter className="items-center">
        {refusal && (
          <p role="alert" className="mr-auto text-xs text-destructive">
            {refusal}
          </p>
        )}
        <Button size="sm" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button size="sm" onClick={apply}>
          {editing ? "Apply" : "Bind"}
        </Button>
      </DialogFooter>
    </>
  )
}

/** The binding editor (PLAN 13.3): 3D into the schematic, or the schematic onto 3D. */
export function BindingDialog() {
  const open = useBindingEditor((s) => s.open)
  const close = useBindingEditor((s) => s.close)
  const doc = useDocumentStore((s) => s.doc)
  return (
    <Dialog open={open !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{open?.editing ? "Binding" : "New binding"}</DialogTitle>
          <DialogDescription>
            What the 3D assembly measures sets the schematic; what the schematic computes is shown
            in 3D. The simulation never moves parts.
          </DialogDescription>
        </DialogHeader>
        {open && <BindingForm key={JSON.stringify(open)} doc={doc} preset={open} close={close} />}
      </DialogContent>
    </Dialog>
  )
}
