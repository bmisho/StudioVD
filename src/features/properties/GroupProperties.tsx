import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { GroupId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { documentHistory } from "@/store/document/history"

/**
 * Group inspector. Renaming is a gesture: the scene tree updates live while typing, and the
 * whole edit becomes ONE undo entry on blur/Enter (Escape reverts it). CLAUDE.md §4.
 */
export function GroupProperties({ id }: { id: GroupId }) {
  const name = useDocumentStore((s) => s.doc.groups[id]?.name)
  const renameGroup = useDocumentStore((s) => s.renameGroup)
  // Raw text while editing (may contain trailing spaces the store trims); null otherwise,
  // so undo/redo and other views show through without syncing state in an effect.
  const [draft, setDraft] = useState<string | null>(null)

  // Never leave history paused if the inspector unmounts mid-edit.
  useEffect(
    () => () => {
      if (documentHistory.isInGesture()) documentHistory.endGesture()
    },
    []
  )

  if (name === undefined) return null

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`group-name-${id}`} className="text-xs text-muted-foreground">
        Name
      </Label>
      <Input
        id={`group-name-${id}`}
        className="h-7 text-sm"
        value={draft ?? name}
        onFocus={() => {
          documentHistory.beginGesture()
          setDraft(name)
        }}
        onChange={(e) => {
          setDraft(e.target.value)
          renameGroup(id, e.target.value)
        }}
        onBlur={() => {
          documentHistory.endGesture()
          setDraft(null)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur()
          if (e.key === "Escape") {
            documentHistory.cancelGesture()
            e.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}
