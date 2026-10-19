import { useMemo } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { partsInSelection } from "@/core/scene/partsInSelection"
import { PartMaterialSection } from "@/features/materials/PartMaterialSection"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { GroupProperties } from "./GroupProperties"
import { PartProperties } from "./PartProperties"
import { ProjectProperties } from "./ProjectProperties"

export function PropertiesPanel() {
  const selection = useSessionStore((s) => s.selection)
  const single = selection.length === 1 ? selection[0] : undefined
  const parts = useDocumentStore((s) => s.doc.parts)
  const groups = useDocumentStore((s) => s.doc.groups)
  // A group or several items: assign a material to every part in them (PLAN 6.4).
  const partIds = useMemo(
    () => (single?.kind === "part" ? [] : [...partsInSelection({ parts, groups }, selection)]),
    [single, parts, groups, selection]
  )
  const materials = partIds.length > 0 && <PartMaterialSection partIds={partIds} />

  let content
  if (selection.length === 0) content = <ProjectProperties />
  else if (single?.kind === "group")
    content = (
      <div className="flex flex-col gap-3">
        <GroupProperties key={single.id} id={single.id} />
        {materials}
      </div>
    )
  else if (single?.kind === "part") content = <PartProperties key={single.id} id={single.id} />
  else {
    const n = selection.length
    content = (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          {n} {n === 1 ? "item" : "items"} selected
        </p>
        {materials}
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      {/* Inspector values are selectable so they can be copied into bug reports. */}
      <div className="p-3 select-text">{content}</div>
    </ScrollArea>
  )
}
