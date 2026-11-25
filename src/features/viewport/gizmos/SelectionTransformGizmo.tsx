import { TransformControls } from "@react-three/drei"
import { useThree } from "@react-three/fiber"
import { useMemo, useRef, useState } from "react"
import { Box3, Vector3, type Group } from "three"
import { fromPose, type Rigid } from "@/core/math/rigid"
import { movedWithPivot, partsOfSelection } from "@/core/scene/selectionTransform"
import type { PartId, Vec3 } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { visiblePartsBox } from "../camera/sceneBounds"
import { partObject } from "../parts/partObjects"
import { readSceneTokens } from "../theme/sceneTokens"
import { gizmoState, type GizmoLike } from "./gizmoState"
import { themeTransformControls } from "./themeGizmo"

const pivotOf = (g: Group): Rigid => ({
  t: g.position.toArray(),
  q: g.quaternion.toArray(),
})

/** The middle of the parts' boxes in the world: where the gizmo sits and turns them about. */
function centreOf(parts: readonly PartId[]): Vec3 | null {
  const all = new Box3()
  const one = new Box3()
  for (const id of parts) {
    const object = partObject(id)
    if (object) all.union(visiblePartsBox(object, one))
  }
  return all.isEmpty() ? null : all.getCenter(new Vector3()).toArray()
}

/**
 * Move/rotate gizmo for a selection of several parts, or a group such as a whole assembly or
 * a library component (0.2.2; one part keeps PartTransformGizmo): one pivot at the middle of
 * them, everything mated to them coming along. During a drag only scene objects move; release
 * writes every pose as ONE undo entry.
 */
export function SelectionTransformGizmo() {
  const selection = useSessionStore((s) => s.selection)
  const designing = useSessionStore((s) => !s.testMode && s.activeTool === "select")
  const mode = useSessionStore((s) => s.gizmoMode)
  // Re-rendered whenever any part moves (a drag, undo, a snap): the pivot is recentred below.
  useDocumentStore((s) => s.doc.parts)
  const invalidate = useThree((s) => s.invalidate)
  const [pivot, setPivot] = useState<Group | null>(null)
  const start = useRef<Rigid | null>(null)

  const single = selection.length === 1 && selection[0]?.kind === "part"
  const moved = useMemo(() => {
    if (!designing || single) return []
    return partsOfSelection(useDocumentStore.getState().doc, selection)
  }, [designing, single, selection])
  const centre = moved.length > 0 ? centreOf(moved) : null

  if (moved.length === 0 || !centre) return null
  const follow = () => {
    if (!pivot || !start.current) return
    const poses = movedWithPivot(
      useDocumentStore.getState().doc,
      moved,
      start.current,
      pivotOf(pivot)
    )
    for (const [id, pose] of poses ?? []) {
      const object = partObject(id)
      object?.position.set(...pose.positionMm)
      object?.quaternion.set(...pose.quaternion)
    }
    invalidate()
  }
  const finish = () => {
    if (!pivot || !start.current) return
    const doc = useDocumentStore.getState().doc
    const poses = movedWithPivot(doc, moved, start.current, pivotOf(pivot))
    start.current = null
    pivot.position.set(...centre)
    pivot.quaternion.identity()
    if (poses) useDocumentStore.getState().setPartPoses(poses)
    else
      for (const id of moved) {
        const pose = doc.parts[id]?.pose
        const object = partObject(id)
        if (pose && object) {
          const r = fromPose(pose)
          object.position.set(...r.t)
          object.quaternion.set(...r.q)
        }
      }
    invalidate()
  }
  return (
    <>
      <group ref={setPivot} position={centre} />
      {pivot && (
        <TransformControls
          ref={(controls) => {
            if (!controls) return
            themeTransformControls(controls, readSceneTokens())
            return gizmoState.attach(controls as unknown as GizmoLike)
          }}
          object={pivot}
          mode={mode}
          space="world"
          size={0.9}
          onMouseDown={() => {
            start.current = pivotOf(pivot)
          }}
          onObjectChange={follow}
          onMouseUp={finish}
        />
      )}
    </>
  )
}
