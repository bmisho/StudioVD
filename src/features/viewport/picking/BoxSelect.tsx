import { useThree } from "@react-three/fiber"
import { useEffect } from "react"
import { useSessionStore } from "@/store/session/sessionStore"
import { useViewport } from "../ViewportContext"
import { gizmoState } from "../gizmos/gizmoState"
import { beginBoxSelect } from "./boxDrag"
import { partAtPoint } from "./partAtPoint"

/**
 * Starts a box selection on a primary press over empty space in the 3D view (design mode, the
 * Select tool). A press on a part is a move drag instead (PickRoot), one on a gizmo handle is
 * the gizmo's; Shift is left free (it raises a moved part).
 */
export function BoxSelect() {
  const get = useThree((s) => s.get)
  const element = useThree((s) => s.gl.domElement)
  const { partsRoot } = useViewport()
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const session = useSessionStore.getState()
      if (e.button !== 0 || e.shiftKey || e.altKey) return
      if (session.testMode || session.activeTool !== "select" || gizmoState.ownsClick()) return
      if (partAtPoint(get(), partsRoot.current, e.clientX, e.clientY)) return
      beginBoxSelect(get(), { x: e.clientX, y: e.clientY })
    }
    element.addEventListener("pointerdown", onPointerDown)
    return () => element.removeEventListener("pointerdown", onPointerDown)
  }, [element, get, partsRoot])
  return null
}
