import { useId, useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ColorSwatches } from "./ColorSwatches"
import { SystemColorPicker } from "./SystemColorPicker"

const HEX = /^#?([0-9a-f]{6})$/i

/** `#RRGGBB` or `RRGGBB` in any case, as stored (lowercase with `#`); null if not a colour. */
function normalizeHex(text: string): string | null {
  const digits = HEX.exec(text.trim())?.[1]
  return digits === undefined ? null : `#${digits.toLowerCase()}`
}

/**
 * An sRGB colour (`value`/`onChange` in the stored lowercase `#rrggbb`): hex text, a preview,
 * swatches and the system colour picker. Typed hex applies once, on Enter or blur, as ONE undo
 * entry; Escape reverts and text that is not a colour applies nothing.
 */
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (hex: string) => void
}) {
  const id = useId()
  // Raw text while editing; null otherwise, so undo/redo and other views show through.
  const [draft, setDraft] = useState<string | null>(null)
  const reverting = useRef(false)
  const typed = draft === null ? value : normalizeHex(draft)

  const commit = (text: string) => {
    setDraft(null)
    if (reverting.current) {
      reverting.current = false
      return
    }
    const hex = normalizeHex(text)
    if (hex !== null && hex !== value) onChange(hex)
  }

  return (
    <div
      role="group"
      aria-labelledby={`${id}-label`}
      className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-2 gap-y-1.5"
    >
      <Label id={`${id}-label`} htmlFor={`${id}-hex`} className="block truncate text-xs">
        {label}
      </Label>
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          aria-hidden
          className="size-5 shrink-0 rounded-sm border border-muted-foreground"
          // The colour shown is user data, not a theme colour.
          style={{ backgroundColor: typed ?? value }}
        />
        <Input
          id={`${id}-hex`}
          className="h-7 min-w-0 px-2 text-xs tabular-nums md:text-xs"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={typed === null ? true : undefined}
          aria-describedby={`${id}-hint`}
          value={draft ?? value}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return // Enter/Escape belong to the IME here
            if (e.key === "Enter") e.currentTarget.blur()
            if (e.key === "Escape") {
              reverting.current = true
              e.currentTarget.blur()
            }
          }}
        />
        <SystemColorPicker value={value} onChange={onChange} />
      </div>
      <div className="col-start-2">
        <ColorSwatches label={label} value={value} onChange={onChange} />
      </div>
      <span id={`${id}-hint`} className="sr-only">
        Hex colour, for example #a3a9b1.
      </span>
    </div>
  )
}
