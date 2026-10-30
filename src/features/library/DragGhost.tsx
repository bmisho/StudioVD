import { useSyncExternalStore } from "react"
import { insertionPreview } from "./insertionPreview"

/**
 * The chip that follows the cursor while a card is dragged (PLAN 9.5): the component's name
 * and what a drop would do. Never in the way: no pointer events.
 */
export function DragGhost() {
  const preview = useSyncExternalStore(insertionPreview.subscribe, insertionPreview.get)
  if (!preview) return null
  const state = !preview.ready
    ? "Preparing…"
    : preview.pose
      ? preview.snap
        ? `Snaps to ${preview.snap}`
        : "Drop to insert · R turns · Alt: no snapping"
      : "Drag into the 3D view"
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed z-50 max-w-64 rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
      style={{ left: preview.pointer.x + 14, top: preview.pointer.y + 14 }}
    >
      <p className="truncate font-medium">{preview.label}</p>
      <p className="truncate text-muted-foreground">{state}</p>
    </div>
  )
}
