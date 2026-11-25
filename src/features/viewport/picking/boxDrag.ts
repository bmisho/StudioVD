import type { RootState } from "@react-three/fiber"
import { Vector3, type BufferGeometry, type Mesh, type Object3D } from "three"
import {
  boxBetween,
  boxSelection,
  partsInBox,
  type Box,
  type ScreenRect,
} from "@/core/scene/boxSelect"
import type { PartId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore, type SelectionItem } from "@/store/session/sessionStore"
import { partObject } from "../parts/partObjects"

/** A press becomes a box past this distance (CSS px), as a press on a part becomes a move. */
const BOX_START_PX = 4

/** The box being dragged, for the overlay that draws it (transient, CLAUDE.md §4 kind 3). */
export const boxSelectOverlay = (() => {
  let current: Box | null = null
  const listeners = new Set<() => void>()
  const get = () => current
  const set = (box: Box | null) => {
    current = box
    for (const listener of listeners) listener()
  }
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => void listeners.delete(listener)
  }
  return { get, set, subscribe }
})()

const v = new Vector3()
const isMesh = (o: Object3D): o is Mesh<BufferGeometry> => (o as Mesh).isMesh === true

/**
 * Where a part's mesh lies on the screen: the bounds of its projected vertices (client px), or
 * null when any of them is behind the camera. Run once, on release.
 */
function screenRectOf(state: RootState, object: Object3D): ScreenRect | null {
  const mesh = object.children.find(isMesh)
  const position = mesh?.geometry.getAttribute("position")
  if (!mesh || !position) return null
  const canvas = state.gl.domElement.getBoundingClientRect()
  const r = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).project(state.camera)
    if (v.z > 1 || v.z < -1) return null
    const x = canvas.left + ((v.x + 1) / 2) * canvas.width
    const y = canvas.top + ((1 - v.y) / 2) * canvas.height
    r.left = Math.min(r.left, x)
    r.right = Math.max(r.right, x)
    r.top = Math.min(r.top, y)
    r.bottom = Math.max(r.bottom, y)
  }
  return position.count > 0 ? r : null
}

/** Each part shown now (visible, not isolated away) and where it lies on the screen. */
function partsOnScreen(state: RootState): Map<PartId, ScreenRect | null> {
  state.camera.updateMatrixWorld()
  const out = new Map<PartId, ScreenRect | null>()
  for (const id of Object.keys(useDocumentStore.getState().doc.parts) as PartId[]) {
    const object = partObject(id)
    if (!object?.visible) continue
    object.updateWorldMatrix(true, true)
    out.set(id, screenRectOf(state, object))
  }
  return out
}

/**
 * Box selection in the 3D view (0.2.1): a primary press on empty space and a drag draws a box;
 * release selects the parts it catches (library components whole), replacing the selection, or
 * adding to it with Ctrl. A press that never moves far enough is left to the click handling.
 */
export function beginBoxSelect(state: RootState, press: { x: number; y: number }): void {
  let box: Box | null = null
  const onMove = (e: PointerEvent) => {
    const to = { x: e.clientX, y: e.clientY }
    if (!box && Math.hypot(to.x - press.x, to.y - press.y) < BOX_START_PX) return
    box = boxBetween(press, to)
    boxSelectOverlay.set(box)
  }
  const finish = (e: PointerEvent | null) => {
    window.removeEventListener("pointermove", onMove, { capture: true })
    window.removeEventListener("pointerup", onUp, { capture: true })
    window.removeEventListener("blur", onBlur)
    boxSelectOverlay.set(null)
    if (!box || !e) return
    const doc = useDocumentStore.getState().doc
    const session = useSessionStore.getState()
    const caught = boxSelection(
      doc,
      partsInBox(box, partsOnScreen(state)),
      session.enteredComponent
    )
    const items = caught as SelectionItem[]
    if (!(e.ctrlKey || e.metaKey)) return session.select(items)
    const have = new Set(session.selection.map((s) => `${s.kind}:${s.id}`))
    session.select([...session.selection, ...items.filter((s) => !have.has(`${s.kind}:${s.id}`))])
  }
  const onUp = (e: PointerEvent) => finish(e)
  const onBlur = () => finish(null)
  window.addEventListener("pointermove", onMove, { capture: true })
  window.addEventListener("pointerup", onUp, { capture: true })
  window.addEventListener("blur", onBlur)
}
