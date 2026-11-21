import { useId } from "react"
import { Button } from "@/components/ui/button"
import type { NodeId } from "@/core/schema"
import { findModel } from "@/core/sim/models/registry"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { NameField } from "./NameField"
import { BindingsSection } from "./BindingsSection"
import { NodeLink } from "./NodeLink"
import { NodeParam } from "./NodeParam"
import { OperatingPoint } from "./OperatingPoint"
import { PropertyField } from "./PropertyField"

/** A schematic block (Phase 11): its label, block, parameters and linked part. */
export function NodeProperties({ id }: { id: NodeId }) {
  const nameId = useId()
  const label = useDocumentStore((s) => s.doc.schematic.nodes[id]?.label)
  const def = useDocumentStore((s) => {
    const n = s.doc.schematic.nodes[id]
    return n ? s.doc.schematic.blockDefs[n.blockDefId] : undefined
  })
  const rename = useDocumentStore((s) => s.renameNode)
  const editBlock = useSessionStore((s) => s.openBlockEditor)
  if (label === undefined || !def) return null
  const model = def.simModel !== undefined ? findModel(def.simModel) : undefined
  const editable = def.simModel === undefined || def.behaviour !== undefined
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <NameField id={nameId} name={label} maxLength={64} rename={(n) => rename(id, n)} />
      </div>
      <div className="flex flex-col gap-1">
        <PropertyField label="Block" value={def.name} />
        {model && <p className="text-xs text-muted-foreground">{model.summary}</p>}
        {def.simModel !== undefined && !model && (
          <p className="text-xs text-warning">
            Made with a newer StudioVD: {def.simModel} is not known here.
          </p>
        )}
        {editable && (
          <Button
            size="sm"
            variant="outline"
            className="mt-1 h-7 self-start text-xs"
            onClick={() => editBlock(def.id)}
          >
            {def.simModel === undefined ? "Edit block…" : "Edit program…"}
          </Button>
        )}
      </div>
      {def.params.length > 0 && (
        <section aria-label="Parameters" className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-muted-foreground">Parameters</h3>
          {def.params.map((p) => (
            <NodeParam key={p.key} node={id} param={p} />
          ))}
        </section>
      )}
      <OperatingPoint id={id} def={def} />
      <NodeLink node={id} />
      <BindingsSection entity={id} preset={{ to: { kind: "param", node: id, param: "" } }} />
    </div>
  )
}
