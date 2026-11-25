import type { RootState } from "@react-three/fiber"
import { Raycaster, Vector2, Vector3 } from "three"
import { add, sub } from "@/core/math/vec3"
import {
  dragPlane,
  movedPoses,
  partsToMove,
  rayOnPlane,
  type DragPlane,
} from "@/core/scene/moveDrag"
import type { SelectionRef } from "@/core/scene/selection"
import type { PartId, Vec3 } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore, type SelectionItem } from "@/store/session/sessionStore"
import { partObject } from "../parts/partObjects"

/** With Shift the part goes straight up or down: the upright plane's sideways part is dropped. */
const onlyUp = (d: Vec3, vertical: boolean): Vec3 => (vertical ? [0, d[1], 0] : d)

/** A press becomes a drag past this distance (CSS px); less is a click. */
const DRAG_START_PX = 4

/**
 * Moving parts by dragging them in the 3D view (design mode): a primary press on a part and a
 * drag slides what was grabbed (the part, or the library component it belongs to, with
 * everything mated to it) along the ground; with Shift held, up and down. During the drag
 * only the scene objects move (transient state); release writes every pose as ONE undo entry
 * and selects what was moved.
 */
export function beginMoveDrag(
  state: RootState,
  target: SelectionRef,
  press: { clientX: number; clientY: number; grab: Vec3 }
): void {
  const doc = useDocumentStore.getState().doc
  const parts = partsToMove(doc, target)
  if (parts.length === 0) return
  const base = new Map<PartId, Vec3>()
  for (const id of parts) {
    const pose = Object.hasOwn(doc.parts, id) ? doc.parts[id]?.pose : undefined
    if (pose) base.set(id, pose.positionMm)
  }

  const raycaster = new Raycaster()
  const ray = (x: number, y: number) => {
    const rect = state.gl.domElement.getBoundingClientRect()
    const ndc = new Vector2(
      ((x - rect.left) / rect.width) * 2 - 1,
      -((y - rect.top) / rect.height) * 2 + 1
    )
    raycaster.setFromCamera(ndc, state.camera)
    return { origin: raycaster.ray.origin.toArray(), dir: raycaster.ray.direction.toArray() }
  }
  const viewDir = (): Vec3 => state.camera.getWorldDirection(new Vector3()).toArray()

  let active = false
  let vertical = false
  let plane: DragPlane = dragPlane(press.grab, viewDir(), false)
  let last: Vec3 | null = press.grab
  let delta: Vec3 = [0, 0, 0]

  const show = (d: Vec3) => {
    for (const [id, at] of base) partObject(id)?.position.set(...add(at, d))
    state.invalidate()
  }
  const onMove = (e: PointerEvent) => {
    if (!active) {
      if (Math.hypot(e.clientX - press.clientX, e.clientY - press.clientY) < DRAG_START_PX) return
      active = true
    }
    if (e.shiftKey !== vertical) {
      // Shift pressed or released mid-drag: carry on from here in the other plane.
      vertical = e.shiftKey
      plane = dragPlane(add(press.grab, delta), viewDir(), vertical)
      last = null
    }
    const r = ray(e.clientX, e.clientY)
    const hit = rayOnPlane(r.origin, r.dir, plane)
    if (!hit) return
    if (last) delta = add(delta, onlyUp(sub(hit, last), vertical))
    last = hit
    show(delta)
  }
  const finish = (keep: boolean) => {
    window.removeEventListener("pointermove", onMove, { capture: true })
    window.removeEventListener("pointerup", onUp, { capture: true })
    window.removeEventListener("blur", onBlur)
    if (!active) return
    const poses = keep ? movedPoses(useDocumentStore.getState().doc, parts, delta) : null
    if (poses && poses.size > 0) {
      useDocumentStore.getState().setPartPoses(poses)
      useSessionStore.getState().select([target as SelectionItem])
    } else show([0, 0, 0]) // cancelled (or out of range): back where they were
  }
  const onUp = () => finish(true)
  const onBlur = () => finish(false)
  window.addEventListener("pointermove", onMove, { capture: true })
  window.addEventListener("pointerup", onUp, { capture: true })
  window.addEventListener("blur", onBlur)
}
