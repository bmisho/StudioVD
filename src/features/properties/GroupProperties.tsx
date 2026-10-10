import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { GroupId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { documentHistory, type GestureToken } from "@/store/document/history"

/** NameSchema's limit; the input stops there instead of silently rejecting the rename. */
const NAME_MAX = 120

/**
 * Group inspector. Renaming is a gesture: the scene tree updates live while typing, and the
 * whole edit becomes ONE undo entry on blur/Enter (Escape reverts it). CLAUDE.md §4.
 */
export function GroupProperties({ id }: { id: GroupId }) {
  const name = useDocumentStore((s) => s.doc.groups[id]?.name)
  const renameGroup = useDocumentStore((s) => s.renameGroup)
  // Raw text while editing (may hold spaces the store trims); null otherwise, so undo/redo
  // and other views show through without syncing state in an effect.
  const [draft, setDraft] = useState<string | null>(null)
  const gesture = useRef<GestureToken | null>(null)

  const finish = () => {
    documentHistory.endGesture(gesture.current)
    gesture.current = null
    setDraft(null)
  }

  // End our gesture if the group disappears mid-edit (undo, delete elsewhere): the input is
  // removed without a blur, and history must not stay paused.
  const gone = name === undefined
  useEffect(() => {
    if (gone && gesture.current) {
      documentHistory.endGesture(gesture.current)
      gesture.current = null
    }
  }, [gone])

  // …and on unmount. Only our own gesture is ever ended (token ownership).
  useEffect(() => () => documentHistory.endGesture(gesture.current), [])

  if (name === undefined) return null

  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold">Group</h3>
      <Label htmlFor={`group-name-${id}`} className="text-xs text-muted-foreground">
        Name
      </Label>
      <Input
        id={`group-name-${id}`}
        className="h-7 text-sm"
        maxLength={NAME_MAX}
        value={draft ?? name}
        onFocus={() => {
          gesture.current = documentHistory.beginGesture()
          setDraft(name)
        }}
        onChange={(e) => {
          setDraft(e.target.value)
          renameGroup(id, e.target.value)
        }}
        onBlur={finish}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return // Enter/Escape belong to the IME here
          if (e.key === "Enter") e.currentTarget.blur()
          if (e.key === "Escape") {
            documentHistory.cancelGesture(gesture.current)
            gesture.current = null
            e.currentTarget.blur()
          }
        }}
      />
    </div>
  )
}
