import { ScrollArea } from "@/components/ui/scroll-area"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { GroupProperties } from "./GroupProperties"

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate tabular-nums">{value}</span>
    </div>
  )
}

function ProjectProperties() {
  const name = useDocumentStore((s) => s.doc.project.name)
  const groupCount = useDocumentStore((s) => Object.keys(s.doc.groups).length)
  const partCount = useDocumentStore((s) => Object.keys(s.doc.parts).length)
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold">Project</h3>
      <Field label="Name" value={name} />
      <Field label="Units" value="mm" />
      <Field label="Groups" value={String(groupCount)} />
      <Field label="Parts" value={String(partCount)} />
    </div>
  )
}

export function PropertiesPanel() {
  const selection = useSessionStore((s) => s.selection)
  const single = selection.length === 1 ? selection[0] : undefined

  let content
  if (selection.length === 0) content = <ProjectProperties />
  else if (single?.kind === "group") content = <GroupProperties key={single.id} id={single.id} />
  else content = <p className="text-xs text-muted-foreground">{selection.length} items selected</p>

  return (
    <ScrollArea className="h-full">
      <div className="p-3">{content}</div>
    </ScrollArea>
  )
}
