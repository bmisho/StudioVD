import { useMemo, useRef } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { partsInSelection } from "@/core/scene/partsInSelection"
import { PartMaterialSection } from "@/features/materials/PartMaterialSection"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { AnchorProperties } from "./AnchorProperties"
import { GroupProperties } from "./GroupProperties"
import { MateProperties } from "./MateProperties"
import { NewMateProperties } from "./NewMateProperties"
import { PartProperties } from "./PartProperties"
import { ProjectProperties } from "./ProjectProperties"
import { useFocusRescue } from "./useFocusRescue"

export function PropertiesPanel() {
  const selection = useSessionStore((s) => s.selection)
  // The Mate tool's second pick shows the new mate's options instead of the selection.
  const newMate = useSessionStore((s) => s.activeTool === "mate" && !!s.mateDraft?.anchorB)
  const single = selection.length === 1 ? selection[0] : undefined
  const parts = useDocumentStore((s) => s.doc.parts)
  const groups = useDocumentStore((s) => s.doc.groups)
  const body = useRef<HTMLDivElement>(null)
  useFocusRescue(body, selection)
  // A group or several items: assign a material to every part in them (PLAN 6.4).
  const partIds = useMemo(
    () => (single?.kind === "part" ? [] : [...partsInSelection({ parts, groups }, selection)]),
    [single, parts, groups, selection]
  )
  const materials = partIds.length > 0 && <PartMaterialSection partIds={partIds} />

  let content
  if (newMate) content = <NewMateProperties />
  else if (selection.length === 0) content = <ProjectProperties />
  else if (single?.kind === "group")
    content = (
      <div className="flex flex-col gap-3">
        <GroupProperties key={single.id} id={single.id} />
        {materials}
      </div>
    )
  else if (single?.kind === "part") content = <PartProperties key={single.id} id={single.id} />
  else if (single?.kind === "anchor") content = <AnchorProperties key={single.id} id={single.id} />
  else if (single?.kind === "mate") content = <MateProperties key={single.id} id={single.id} />
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
      <div
        ref={body}
        // Where focus goes when the control holding it disappears (useFocusRescue).
        tabIndex={-1}
        className="p-3 outline-none select-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        {content}
      </div>
    </ScrollArea>
  )
}
