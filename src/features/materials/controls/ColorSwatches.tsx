import { Check } from "lucide-react"
import { useRef, type KeyboardEvent } from "react"
import { cn } from "@/lib/utils"

interface Swatch {
  name: string
  /** Stored format: lowercase sRGB `#rrggbb`. */
  value: string
  /** Dark enough that the check mark is drawn light. */
  dark: boolean
}

/**
 * Quick picks: neutral greys and common plastic and paint colours. These are document colours
 * (user data), not theme tokens, so they are values here and inline styles below. Artistic
 * choices, no standard behind them.
 */
const SWATCHES: readonly Swatch[] = [
  { name: "White", value: "#f2f2f0", dark: false },
  { name: "Light grey", value: "#c8cacc", dark: false },
  { name: "Grey", value: "#8a8d91", dark: false },
  { name: "Dark grey", value: "#4b4e52", dark: true },
  { name: "Black", value: "#1c1c1e", dark: true },
  { name: "Beige", value: "#e6dfca", dark: false },
  { name: "Yellow", value: "#f2c318", dark: false },
  { name: "Orange", value: "#e8711c", dark: false },
  { name: "Red", value: "#c42b26", dark: true },
  { name: "Green", value: "#2f7d3a", dark: true },
  { name: "Blue", value: "#1f5fae", dark: true },
  { name: "Purple", value: "#6a3d9a", dark: true },
]

/** Arrow keys move through the swatches (wrapping), as in a radio group. */
const STEPS = new Map([
  ["ArrowRight", 1],
  ["ArrowDown", 1],
  ["ArrowLeft", -1],
  ["ArrowUp", -1],
])

/**
 * Colour swatches as a WAI-ARIA radio group: one tab stop (the checked swatch, else the
 * first), arrow keys move focus and pick, each pick is one undo entry. Every swatch is named
 * and the checked one carries a check mark: colour is never the only cue.
 */
export function ColorSwatches({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (hex: string) => void
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const checked = SWATCHES.findIndex((s) => s.value === value)
  const stop = Math.max(checked, 0)

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const step = STEPS.get(e.key)
    if (step === undefined || e.ctrlKey || e.metaKey || e.altKey) return // not ours: bubbles
    e.preventDefault()
    const next = (index + step + SWATCHES.length) % SWATCHES.length
    buttons.current[next]?.focus()
    const swatch = SWATCHES[next]
    if (swatch) onChange(swatch.value)
  }

  return (
    <div role="radiogroup" aria-label={`${label} swatches`} className="flex flex-wrap gap-1">
      {SWATCHES.map((swatch, i) => (
        <button
          key={swatch.value}
          ref={(el) => {
            buttons.current[i] = el
          }}
          type="button"
          role="radio"
          aria-checked={i === checked}
          aria-label={swatch.name}
          title={swatch.name}
          tabIndex={i === stop ? 0 : -1}
          // Light swatches need the darker outline to stay visible (slate-500, 4.76:1).
          className="grid size-6 place-items-center rounded-sm border border-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          style={{ backgroundColor: swatch.value }}
          onClick={() => onChange(swatch.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {i === checked && (
            <Check
              aria-hidden
              className={cn("size-3.5", swatch.dark ? "text-background" : "text-foreground")}
            />
          )}
        </button>
      ))}
    </div>
  )
}
