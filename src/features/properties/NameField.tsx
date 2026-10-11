import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { documentHistory, type GestureToken } from "@/store/document/history"

/** NameSchema's limit; the input stops there instead of silently rejecting the rename. */
const NAME_MAX = 120

/**
 * Inspector name field. Renaming is a gesture: other views update live while typing, and the
 * whole edit becomes ONE undo entry on blur/Enter (Escape reverts it). CLAUDE.md §4.
 * `name` is undefined once the entity is gone (undo, delete elsewhere).
 */
export function NameField({
  id,
  name,
  rename,
}: {
  id: string
  name: string | undefined
  rename: (name: string) => void
}) {
  // Raw text while editing (may hold spaces the store trims); null otherwise, so undo/redo
  // and other views show through without syncing state in an effect.
  const [draft, setDraft] = useState<string | null>(null)
  const gesture = useRef<GestureToken | null>(null)

  const finish = () => {
    documentHistory.endGesture(gesture.current)
    gesture.current = null
    setDraft(null)
  }

  // End our gesture if the entity disappears mid-edit: the input is removed without a blur,
  // and history must not stay paused.
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
    <>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        Name
      </Label>
      <Input
        id={id}
        className="h-7 text-sm"
        maxLength={NAME_MAX}
        value={draft ?? name}
        onFocus={() => {
          gesture.current = documentHistory.beginGesture()
          setDraft(name)
        }}
        onChange={(e) => {
          setDraft(e.target.value)
          rename(e.target.value)
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
    </>
  )
}
