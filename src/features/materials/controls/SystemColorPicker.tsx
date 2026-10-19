import { Palette } from "lucide-react"
import { useEffect, useEffectEvent, useRef } from "react"
import { documentHistory, type GestureToken } from "@/store/document/history"

/**
 * The webview's own colour dialog, behind a small labelled button. Its `input` events apply
 * live within ONE gesture (CLAUDE.md §4); the native `change` (a colour was chosen) ends it,
 * and so does blur, because a dialog dismissed without a choice may never fire `change`.
 * React's onChange also fires on `change`, so commits are handled by a native listener only.
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

  const apply = (hex: string) => {
    gesture.current ??= documentHistory.beginGesture() // the first input event
    onChange(hex.toLowerCase())
  }
  const end = () => {
    documentHistory.endGesture(gesture.current)
    gesture.current = null
  }
  const commit = useEffectEvent((hex: string) => {
    apply(hex)
    end()
  })

  useEffect(() => {
    const el = input.current
    if (!el) return
    const onCommit = () => commit(el.value)
    el.addEventListener("change", onCommit)
    return () => el.removeEventListener("change", onCommit)
  }, [])
  // Only our own gesture is ever ended (token ownership), also when unmounted mid-pick.
  useEffect(() => () => documentHistory.endGesture(gesture.current), [])

  return (
    <label
      title="System colour picker"
      className="relative inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-input bg-background text-foreground hover:bg-accent-subtle has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
    >
      <Palette aria-hidden className="size-3.5" />
      <span className="sr-only">System colour picker</span>
      <input
        ref={input}
        type="color"
        className="sr-only"
        value={value}
        onChange={(e) => {
          if (e.nativeEvent.type === "input") apply(e.target.value)
        }}
        onBlur={end}
      />
    </label>
  )
}
