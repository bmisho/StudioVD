import { useEffect, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { documentHistory, type GestureToken } from "@/store/document/history"
import { formatValue, parseDecimal } from "./numberText"

/**
 * A typed number as a gesture (like NameField): values apply live while typing, and the whole
 * edit becomes ONE undo entry on Enter/blur (Escape restores the value it had on focus).
 * CLAUDE.md §4. Text that is not a number is flagged and applies nothing; once the field
 * loses focus it shows the stored value again. The parent unmounts it when the entity goes.
 */
export function NumberField({
  id,
  value,
  clamp,
  onChange,
  className,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
}: {
  id: string
  value: number
  /** The value a typed number applies as (clamped to the bounds); null applies nothing. */
  clamp: (typed: number) => number | null
  onChange: (value: number) => void
  className?: string
  "aria-label"?: string
  "aria-describedby"?: string
}) {
  // Raw text while editing; null otherwise, so undo/redo and other views show through.
  const [draft, setDraft] = useState<string | null>(null)
  const gesture = useRef<GestureToken | null>(null)

  // Only our own gesture is ever ended (token ownership), also when unmounted mid-edit.
  useEffect(() => () => documentHistory.endGesture(gesture.current), [])

  const finish = () => {
    documentHistory.endGesture(gesture.current)
    gesture.current = null
    setDraft(null)
  }

  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      className={cn("h-7 px-2 text-right text-xs tabular-nums md:text-xs", className)}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      aria-invalid={draft !== null && clamp(parseDecimal(draft)) === null ? true : undefined}
      value={draft ?? formatValue(value)}
      onFocus={() => {
        gesture.current = documentHistory.beginGesture()
        setDraft(formatValue(value))
      }}
      onChange={(e) => {
        setDraft(e.target.value)
        const next = clamp(parseDecimal(e.target.value))
        if (next !== null) onChange(next)
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
  )
}
