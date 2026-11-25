import { useSyncExternalStore } from "react"
import { boxSelectOverlay } from "./boxDrag"

/**
 * The box being dragged in the 3D view (0.2.1), over the canvas: solid while it selects what
 * lies entirely inside (dragged rightward), dashed while it selects what it touches (leftward).
 */
export function BoxSelectOverlay() {
  const box = useSyncExternalStore(boxSelectOverlay.subscribe, boxSelectOverlay.get)
  if (!box) return null
  const { left, top, right, bottom } = box.rect
  return (
    <div
      aria-hidden="true"
      data-testid="box-select"
      data-mode={box.mode}
      className={`pointer-events-none fixed z-10 border-2 border-ring bg-accent/40 ${
        box.mode === "crossing" ? "border-dashed" : ""
      }`}
      style={{ left, top, width: right - left, height: bottom - top }}
    />
  )
}
