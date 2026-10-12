import { TransformControls } from "@react-three/drei"
import { useEffect, useRef, useSyncExternalStore } from "react"
import type { Object3D } from "three"
import type { PartId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { partObject, subscribePartObjects } from "../parts/partObjects"
import { readSceneTokens } from "../theme/sceneTokens"
import { gizmoState, type GizmoLike } from "./gizmoState"
import { themeTransformControls } from "./themeGizmo"

/** The single selected part, if the gizmo applies to it (design mode, drawn now). */
function useGizmoTarget(): PartId | null {
  return useSessionStore((s) => {
    const only = s.selection.length === 1 ? s.selection[0] : undefined
    if (s.testMode || only?.kind !== "part") return null
    if (s.isolated && !s.isolated.includes(only.id)) return null
    return only.id
  })
}

/** The pose the gizmo left the object in, written to the document as ONE change. */
function writePose(id: PartId, object: Object3D): void {
  useDocumentStore.getState().setPartPose(id, {
    positionMm: object.position.toArray(),
    quaternion: object.quaternion.normalize().toArray(),
  })
}

/**
 * Move/rotate gizmo for free placement (PLAN 4.8). During a drag only the part's scene object
 * moves; the design pose is written once on release, so a drag is ONE undo entry (no history
 * gesture that a focused inspector field could hold) and the scene tree does not re-render on
 * every pointer move.
 */
export function PartTransformGizmo() {
  const id = useGizmoTarget()
  const visible = useDocumentStore((s) => (id ? s.doc.parts[id]?.visible === true : false))
  const mode = useSessionStore((s) => s.gizmoMode)
  // The part's group registers in its ref callback (commit phase): subscribe, don't look once.
  const object = useSyncExternalStore(subscribePartObjects, () =>
    id && visible ? (partObject(id) ?? null) : null
  )
  const dragging = useRef(false)
  // A drag cut short (Escape clears the selection mid-drag) still keeps where it got to.
  useEffect(() => {
    return () => {
      if (dragging.current && id && object) writePose(id, object)
      dragging.current = false
    }
  }, [id, object])

  if (!id || !object) return null
  return (
    <TransformControls
      ref={(controls) => {
        if (!controls) return
        themeTransformControls(controls, readSceneTokens())
        // three-stdlib types `axis` as private; it is the public hover state of the handles.
        return gizmoState.attach(controls as unknown as GizmoLike)
      }}
      object={object}
      mode={mode}
      space={mode === "rotate" ? "local" : "world"}
      size={0.9}
      onMouseDown={() => {
        dragging.current = true
      }}
      onMouseUp={() => {
        if (dragging.current) writePose(id, object)
        dragging.current = false
      }}
    />
  )
}
