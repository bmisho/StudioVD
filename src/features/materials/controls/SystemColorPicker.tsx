import { Palette } from "lucide-react"
import { useEffect, useEffectEvent, useRef } from "react"
import { documentHistory, type GestureToken } from "@/store/document/history"

/** Quiet time after the last colour event that ends a pick. */
export const PICK_IDLE_MS = 800

/**
 * The webview's own colour dialog, behind a small labelled button. A pick is ONE gesture
 * (CLAUDE.md §4) however the webview reports it: Chromium sends `input` while choosing and
 * one `change` at the end; WebKitGTK sends `input` and `change` for every live update, and
 * on Cancel once more with the old colour. So `change` never ends the pick: it ends when the
 * events stop for a moment, when the page gets focus back from the dialog, or on blur. A
 * cancelled pick then ends where it began and adds no undo entry.
 */
export function SystemColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (hex: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const gesture = useRef<GestureToken | null>(null)
  const idle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const end = () => {
    clearTimeout(idle.current)
    documentHistory.endGesture(gesture.current)
    gesture.current = null
  }
  const apply = useEffectEvent((hex: string) => {
    gesture.current ??= documentHistory.beginGesture() // the first event of a pick
    onChange(hex.toLowerCase())
    clearTimeout(idle.current)
    idle.current = setTimeout(end, PICK_IDLE_MS)
  })

  useEffect(() => {
    const el = input.current
    if (!el) return
    // Native listeners: React's onChange fires for both events and cannot tell them apart.
    const onEvent = () => apply(el.value)
    const onFocusBack = () => {
      if (gesture.current) end()
    }
    el.addEventListener("input", onEvent)
    el.addEventListener("change", onEvent)
    window.addEventListener("focus", onFocusBack)
    return () => {
      el.removeEventListener("input", onEvent)
      el.removeEventListener("change", onEvent)
      window.removeEventListener("focus", onFocusBack)
    }
  }, [])
  // Shows the stored colour when it changes elsewhere (not mid-pick: the dialog owns it).
  useEffect(() => {
    if (input.current && !gesture.current) input.current.value = value
  }, [value])
  // Only our own gesture is ever ended (token ownership), also when unmounted mid-pick.
  useEffect(
    () => () => {
      clearTimeout(idle.current)
      documentHistory.endGesture(gesture.current)
    },
    []
  )

  return (
    <label
      title="System colour picker"
      className="relative inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-input bg-background text-foreground hover:bg-accent-subtle has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
    >
      <Palette aria-hidden className="size-3.5" />
      <span className="sr-only">System colour picker</span>
      {/* Uncontrolled: React would reset a controlled value after each event, mid-pick. */}
      <input ref={input} type="color" className="sr-only" defaultValue={value} onBlur={end} />
    </label>
  )
}
