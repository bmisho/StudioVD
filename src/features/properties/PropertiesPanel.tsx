import { ScrollArea } from "@/components/ui/scroll-area"
import { useSessionStore } from "@/store/session/sessionStore"
import { GroupProperties } from "./GroupProperties"
import { ProjectProperties } from "./ProjectProperties"

export function PropertiesPanel() {
  const selection = useSessionStore((s) => s.selection)
  const single = selection.length === 1 ? selection[0] : undefined

  let content
  if (selection.length === 0) content = <ProjectProperties />
  else if (single?.kind === "group") content = <GroupProperties key={single.id} id={single.id} />
  else content = <p className="text-xs text-muted-foreground">{selection.length} items selected</p>

  return (
    <ScrollArea className="h-full">
      {/* Inspector values are selectable so they can be copied into bug reports. */}
      <div className="p-3 select-text">{content}</div>
    </ScrollArea>
  )
}
