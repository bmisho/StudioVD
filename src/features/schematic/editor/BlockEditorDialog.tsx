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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BlockDefSchema, type BlockDef } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { BehaviourEditor } from "./BehaviourEditor"
import { ParamListEditor } from "./ParamListEditor"
import { PortListEditor } from "./PortListEditor"

type Draft = Pick<BlockDef, "name" | "ports" | "params" | "behaviour">

/** The first schema problem of a draft, said with where it is. */
function problemOf(def: BlockDef): string | null {
  const parsed = BlockDefSchema.safeParse(def)
  if (parsed.success) return null
  const issue = parsed.error.issues[0]
  const [list, index, field] = issue?.path ?? []
  const what = list === "ports" ? "Port" : list === "params" ? "Parameter" : null
  const where =
    what && typeof index === "number"
      ? `${what} ${index + 1}${field !== undefined ? ` ${String(field)}` : ""}: `
      : ""
  return `${where}${issue?.message ?? "not valid"}`
}

/** Edits one block definition; Apply is one undo entry for every block of it. */
function EditorBody({ def, close }: { def: BlockDef; close: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => ({
    name: def.name,
    ports: def.ports,
    params: def.params,
    behaviour: def.behaviour ?? "",
  }))
  const update = useDocumentStore((s) => s.updateBlockDef)
  const [refusal, setRefusal] = useState<string | null>(null)
  const builtIn = def.simModel !== undefined
  const next: BlockDef = { ...def, ...draft }
  const problem = problemOf(next)
  const apply = () => {
    const why = update(def.id, builtIn ? { behaviour: draft.behaviour } : draft)
    if (why) setRefusal(why)
    else close()
  }
  return (
    <>
      <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
        {!builtIn && (
          <>
            <div className="flex flex-col gap-1">
              <Label htmlFor="block-name" className="text-xs text-muted-foreground">
                Block name
              </Label>
              <Input
                id="block-name"
                value={draft.name}
                maxLength={120}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="h-7 text-xs"
              />
            </div>
            <PortListEditor
              ports={draft.ports}
              onChange={(ports) => setDraft({ ...draft, ports })}
            />
            <ParamListEditor
              params={draft.params}
              onChange={(params) => setDraft({ ...draft, params })}
            />
          </>
        )}
        <BehaviourEditor
          value={draft.behaviour ?? ""}
          def={next}
          onChange={(behaviour) => setDraft({ ...draft, behaviour })}
        />
      </div>
      <DialogFooter className="items-center">
        {(problem ?? refusal) && (
          <p role="alert" className="mr-auto text-xs text-destructive">
            {problem ?? refusal}
          </p>
        )}
        <Button size="sm" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button size="sm" onClick={apply} disabled={problem !== null}>
          Apply
        </Button>
      </DialogFooter>
    </>
  )
}

/** The black-box editor (PLAN 11.5): ports, parameters and a sandboxed behaviour. */
export function BlockEditorDialog() {
  const id = useSessionStore((s) => s.blockEditor)
  const open = useSessionStore((s) => s.openBlockEditor)
  const current = useDocumentStore((s) => (id ? s.doc.schematic.blockDefs[id] : undefined))
  // The last definition shown stays while the dialog animates closed.
  const [last, setLast] = useState(current)
  if (current && current !== last) setLast(current)
  const def = current ?? last
  const builtIn = def?.simModel !== undefined
  return (
    <Dialog open={current !== undefined} onOpenChange={(o) => !o && open(null)}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{builtIn ? `${def?.name ?? ""} program` : "Black box"}</DialogTitle>
          <DialogDescription>
            {builtIn
              ? "What the board does with its pins: every block of this board runs it."
              : "Every block of this definition changes with it. Wires to removed ports go."}
          </DialogDescription>
        </DialogHeader>
        {/* A fresh draft per definition opened. */}
        {def && <EditorBody key={def.id} def={def} close={() => open(null)} />}
      </DialogContent>
    </Dialog>
  )
}
