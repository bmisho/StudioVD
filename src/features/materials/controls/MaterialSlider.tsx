import { Slider as SliderPrimitive } from "radix-ui"
import { useEffect, useId, useRef } from "react"
import { Label } from "@/components/ui/label"
import { clampField, type MaterialField } from "@/core/materials/materialFields"
import { cn } from "@/lib/utils"
import { documentHistory, type GestureToken } from "@/store/document/history"
import { NumberField } from "./NumberField"
import { formatValue } from "./numberText"

/** Keys the slider handles itself (Radix). Any other key ends a keyboard burst. */
const SLIDER_KEYS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
])
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta"])

/**
 * One numeric material value: label, slider and a number field taking the full bounds
 * (`slider={false}`: the number field alone, for values spanning decades like density).
 * Each drag, and each burst of slider keys, is ONE undo entry (CLAUDE.md §4): a drag ends on
 * pointer up; a key burst on blur or on any other key, so Ctrl+Z right after undoes it.
 * Radix commits after every key step, so `onValueCommit` cannot mark the end.
 */
export function MaterialSlider({
  field,
  value,
  onChange,
  slider = true,
}: {
  field: MaterialField
  value: number
  onChange: (value: number) => void
  slider?: boolean
}) {
  const id = useId()
  const gesture = useRef<GestureToken | null>(null)
  const unit = field.unit ? ` (${field.unit})` : ""
  const sliderMin = field.min
  // A value past the slider's usual span (glow 50 of 0-10) widens it, so a key step moves
  // from the real value instead of snapping it into the span.
  const sliderMax = Math.max(field.sliderMax ?? field.max, value)

  const end = () => {
    documentHistory.endGesture(gesture.current)
    gesture.current = null
  }
  // Only our own gesture is ever ended (token ownership), also when unmounted mid-drag.
  useEffect(() => () => documentHistory.endGesture(gesture.current), [])

  const slide = (values: number[]) => {
    const next = values[0] === undefined ? null : clampField(field, values[0])
    if (next === null) return
    gesture.current ??= documentHistory.beginGesture() // the first key of a burst
    onChange(next)
  }

  return (
    <div
      className="grid grid-cols-[6rem_minmax(0,1fr)_4.5rem] items-center gap-x-2"
      title={field.hint}
    >
      <Label
        htmlFor={`${id}-input`}
        className={cn("block truncate text-xs", !slider && "col-span-2")}
      >
        {field.label}
        {unit}
      </Label>
      {slider && (
        <SliderPrimitive.Root
          className="relative flex h-7 w-full touch-none items-center select-none"
          min={sliderMin}
          max={sliderMax}
          step={field.step}
          value={[Math.min(sliderMax, Math.max(sliderMin, value))]}
          onValueChange={slide}
          onPointerDown={() => {
            end() // a key burst still open
            gesture.current = documentHistory.beginGesture()
          }}
          onPointerUp={end}
          onPointerCancel={end}
          onKeyDown={(e) => {
            if (!SLIDER_KEYS.has(e.key) && !MODIFIER_KEYS.has(e.key)) end()
          }}
        >
          {/* muted-foreground: the track is the control's extent, so it needs 3:1 (input: 1.48:1). */}
          <SliderPrimitive.Track className="relative h-1 grow overflow-hidden rounded-full bg-muted-foreground">
            <SliderPrimitive.Range className="absolute h-full bg-primary" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            aria-label={field.label}
            aria-describedby={`${id}-hint`}
            aria-valuetext={field.unit ? `${formatValue(value)} ${field.unit}` : formatValue(value)}
            className="block size-3.5 rounded-full border border-primary bg-background shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onBlur={end}
          />
        </SliderPrimitive.Root>
      )}
      <NumberField
        id={`${id}-input`}
        className="col-start-3"
        value={value}
        clamp={(typed) => clampField(field, typed)}
        onChange={onChange}
        aria-describedby={`${id}-hint`}
      />
      {/* The tooltip is mouse-only; screen readers get the same hint here. */}
      <span id={`${id}-hint`} className="sr-only">
        {field.hint}
      </span>
    </div>
  )
}
