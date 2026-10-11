/**
 * What the transform gizmo is doing with the pointer. Transient state (CLAUDE.md §4 kind 3):
 * picking reads it so a click on a handle neither selects the part behind it nor clears the
 * selection. The press is recorded on pointerdown (capture phase, before the gizmo sees it)
 * because the gizmo forgets its hovered handle on pointerup, before the click arrives.
 */
export interface GizmoLike {
  axis: string | null
  dragging: boolean
}

let current: GizmoLike | null = null
let pressedOnHandle = false

const onPointerDown = () => {
  pressedOnHandle = current !== null && (current.axis !== null || current.dragging)
}

export const gizmoState = {
  attach(gizmo: GizmoLike): () => void {
    current = gizmo
    window.addEventListener("pointerdown", onPointerDown, { capture: true })
    return () => {
      if (current !== gizmo) return
      current = null
      pressedOnHandle = false
      window.removeEventListener("pointerdown", onPointerDown, { capture: true })
    }
  },
  /** The hovered or dragged handle ("X", "XY", …), or null. */
  axis(): string | null {
    return current?.axis ?? null
  },
  /** Whether the click being handled ends a press that began on a gizmo handle. */
  ownsClick(): boolean {
    return pressedOnHandle
  },
}
