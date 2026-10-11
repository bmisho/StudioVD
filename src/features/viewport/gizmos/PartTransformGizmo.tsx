import { TransformControls } from "@react-three/drei"
import { useEffect, useRef, useSyncExternalStore } from "react"
import type { PartId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { documentHistory, type GestureToken } from "@/store/document/history"
import { useSessionStore } from "@/store/session/sessionStore"
import { partObject, subscribePartObjects } from "../parts/partObjects"
import { gizmoState, type GizmoLike } from "./gizmoState"

/** The single selected part, if the gizmo applies to it (design mode, drawn now). */
function useGizmoTarget(): PartId | null {
  return useSessionStore((s) => {
    const only = s.selection.length === 1 ? s.selection[0] : undefined
    if (s.testMode || only?.kind !== "part") return null
    if (s.isolated && !s.isolated.includes(only.id)) return null
    return only.id
  })
}

/**
 * Move/rotate gizmo for free placement (PLAN 4.8). The part's scene object follows the drag
 * and the design pose is written to the store live; the whole drag is ONE undo entry.
 */
export function PartTransformGizmo() {
  const id = useGizmoTarget()
  const visible = useDocumentStore((s) => (id ? s.doc.parts[id]?.visible === true : false))
  const mode = useSessionStore((s) => s.gizmoMode)
  // The part's group registers in its ref callback (commit phase): subscribe, don't look once.
  const object = useSyncExternalStore(subscribePartObjects, () =>
    id && visible ? (partObject(id) ?? null) : null
  )
  const gesture = useRef<GestureToken | null>(null)
  // A drag cut short (Escape clears the selection, undo deletes the part) still ends its
  // gesture, or history would stay paused.
  useEffect(() => {
    return () => {
      documentHistory.endGesture(gesture.current)
      gesture.current = null
    }
  }, [object])

  if (!id || !object) return null
  const write = () =>
    useDocumentStore.getState().setPartPose(id, {
      positionMm: object.position.toArray(),
      quaternion: object.quaternion.normalize().toArray(),
    })

  return (
    <TransformControls
      // three-stdlib types `axis` as private; it is the public hover state of the handles.
      ref={(controls) =>
        controls ? gizmoState.attach(controls as unknown as GizmoLike) : undefined
      }
      object={object}
      mode={mode}
      space={mode === "rotate" ? "local" : "world"}
      size={0.9}
      onMouseDown={() => {
        gesture.current = documentHistory.beginGesture()
      }}
      onObjectChange={write}
      onMouseUp={() => {
        documentHistory.endGesture(gesture.current)
        gesture.current = null
      }}
    />
  )
}
