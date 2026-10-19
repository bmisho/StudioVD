import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react"
import type { PartId } from "@/core/schema"
import { viewportHover } from "@/features/viewport/picking/hoverStore"
import { viewportBridge } from "@/features/viewport/viewportBridge"

/** A press moves this far (CSS px) before it is a drag rather than a click. */
export const DRAG_THRESHOLD_PX = 4

interface Drag {
  pointerId: number
  x: number
  y: number
  dragging: boolean
  target: PartId | null
}

/**
 * Drag something from the sidebar onto a part in the 3D view (PLAN 6.4). The press captures
 * the pointer, so the viewport's own hover stops: the part under the cursor is hovered from
 * here instead, and gets `onDrop` on release. Escape cancels. A press that never moved stays a
 * click: `clickAllowed()` tells the element's onClick whether to run (keyboard users assign to
 * the selection through it).
 */
export function useDragToPart(onDrop: (partId: PartId) => void) {
  const drag = useRef<Drag | null>(null)
  const suppressClick = useRef(false)

  const end = (drop: boolean) => {
    const d = drag.current
    drag.current = null
    if (!d?.dragging) return
    suppressClick.current = true
    viewportHover.set(null)
    document.body.style.removeProperty("cursor")
    if (drop && d.target) onDrop(d.target)
  }

  // Escape cancels a drag in progress (a gesture key, not an app shortcut: capture phase, so
  // the command registry never sees it while dragging).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !drag.current?.dragging) return
      e.preventDefault()
      e.stopPropagation()
      end(false)
    }
    window.addEventListener("keydown", onKey, true)
    return () => {
      window.removeEventListener("keydown", onKey, true)
      end(false)
    }
    // `end` reads refs only; re-subscribing on every render is not needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button !== 0) return
      suppressClick.current = false
      drag.current = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        dragging: false,
        target: null,
      }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const d = drag.current
      if (!d || d.pointerId !== e.pointerId) return
      if (!d.dragging && Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_THRESHOLD_PX) return
      d.dragging = true
      d.target = viewportBridge.partAt(e.clientX, e.clientY)
      viewportHover.set(d.target ? { kind: "part", id: d.target } : null)
      document.body.style.cursor = d.target ? "copy" : "no-drop"
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      if (drag.current?.pointerId === e.pointerId) end(true)
    },
    onLostPointerCapture: () => end(false),
    clickAllowed: () => {
      const allowed = !suppressClick.current
      suppressClick.current = false
      return allowed
    },
  }
}
