import type { LibraryItem } from "@/core/library/items"
import { placePose, type PlacementTarget } from "@/core/library/placement"
import type { ViewportApi } from "@/features/viewport/viewportBridge"
import type { Notifier } from "@/lib/notify"
import type { DocumentStore } from "@/store/document/documentStore"
import type { SessionStore } from "@/store/session/sessionStore"
import type { InsertionPreviewStore } from "./insertionPreview"
import { insertionSteps, message } from "./insertionSteps"
import { prepareInsertion, type InsertionBackend, type ReadyComponent } from "./prepareInsertion"

/** A press moves this far (CSS px) before it is a drag (as material drags, PLAN 6.4). */
export const INSERT_DRAG_PX = 4

export interface InsertionDeps {
  backend: InsertionBackend
  document: DocumentStore
  session: SessionStore
  view: Pick<ViewportApi, "probe" | "toClient" | "centre">
  preview: InsertionPreviewStore
  notify: Notifier
  projectBusy: () => boolean
  target?: Pick<Window, "addEventListener" | "removeEventListener">
}

interface Drag {
  item: LibraryItem
  pointerId: number
  start: { x: number; y: number }
  at: { x: number; y: number }
  dragging: boolean
  turns: number
  noSnap: boolean
  ready: Promise<ReadyComponent> | null
  value: ReadyComponent | null
}

/**
 * Library insertion (PLAN 9.5): a pointer-event drag from a card (a DOM chip, then a 3D ghost
 * over the view) placed on a fitting anchor, the surface under the cursor or the ground; R
 * turns it 90°, Alt skips snapping, Escape cancels. The drop inserts ONE undo entry and
 * selects the component. Enter, double-click or Insert place it at the middle of the view.
 */
export function createInsertionController(deps: InsertionDeps) {
  const win = deps.target ?? window
  let drag: Drag | null = null

  const prepare = (item: LibraryItem) => {
    if (!item.insert) return Promise.reject(new Error("This component cannot be inserted."))
    return prepareInsertion(item.insert, deps.backend, () => deps.document.getState().doc.assets)
  }
  const { blocked, place, insert } = insertionSteps(deps)

  const show = () => {
    const d = drag
    if (!d?.dragging) return
    const found = d.value ? place(d.value, d.at.x, d.at.y, d.noSnap, d.turns) : null
    deps.preview.set({
      label: d.item.name,
      pointer: d.at,
      ready: d.value,
      pose: found?.pose ?? null,
      snap: found?.snap ?? null,
    })
    document.body.style.cursor = found || !d.value ? "copy" : "no-drop"
  }
  const stop = () => {
    drag = null
    deps.preview.set(null)
    document.body.style.removeProperty("cursor")
    win.removeEventListener("pointermove", onMove)
    win.removeEventListener("pointerup", onUp)
    win.removeEventListener("pointercancel", stop)
    win.removeEventListener("keydown", onKey, true)
    win.removeEventListener("keyup", onKey, true)
  }
  function onMove(e: PointerEvent) {
    const d = drag
    if (!d || e.pointerId !== d.pointerId) return
    d.at = { x: e.clientX, y: e.clientY }
    d.noSnap = e.altKey
    if (!d.dragging) {
      if (Math.hypot(d.at.x - d.start.x, d.at.y - d.start.y) < INSERT_DRAG_PX) return
      if (blocked()) return stop()
      d.dragging = true
      d.ready = prepare(d.item)
      d.ready.then(
        (value) => {
          if (drag !== d) return
          d.value = value
          show()
        },
        (err: unknown) => {
          if (drag !== d) return
          deps.notify.error(`${d.item.name} could not be prepared`, message(err))
          stop()
        }
      )
    }
    show()
  }
  function onUp(e: PointerEvent) {
    const d = drag
    if (!d || e.pointerId !== d.pointerId) return
    stop()
    if (!d.dragging || !d.ready) return // a click: the card was only made active
    const [x, y] = [e.clientX, e.clientY]
    if (!deps.view.probe(x, y)) return // dropped outside the 3D view
    void d.ready.then(
      (ready) => {
        if (blocked()) return
        const found = place(ready, x, y, d.noSnap, d.turns)
        if (found) insert(ready, found.pose)
      },
      () => undefined
    )
  }
  // Gesture keys while dragging (capture phase, so the command registry never sees them).
  function onKey(e: KeyboardEvent) {
    const d = drag
    if (!d?.dragging) return
    if (e.type === "keydown" && e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      return stop()
    }
    if (e.type === "keydown" && (e.key === "r" || e.key === "R") && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      e.stopPropagation()
      d.turns = (d.turns + (e.shiftKey ? 3 : 1)) % 4
    }
    if (e.key === "Alt") e.preventDefault() // no menu-bar focus mid-drag
    d.noSnap = e.altKey
    show()
  }

  return {
    /** A primary press on an insertable card: the drag starts once it moves. */
    press(item: LibraryItem, e: Pick<PointerEvent, "pointerId" | "clientX" | "clientY">): void {
      stop()
      const start = { x: e.clientX, y: e.clientY }
      drag = {
        item,
        pointerId: e.pointerId,
        start,
        at: start,
        dragging: false,
        turns: 0,
        noSnap: false,
        ready: null,
        value: null,
      }
      win.addEventListener("pointermove", onMove)
      win.addEventListener("pointerup", onUp)
      win.addEventListener("pointercancel", stop)
      win.addEventListener("keydown", onKey, true)
      win.addEventListener("keyup", onKey, true)
    },
    /** Enter, double-click or Insert: on the surface or ground at the middle of the view. */
    async insertAtDefault(item: LibraryItem): Promise<void> {
      if (blocked()) return
      let ready: ReadyComponent
      try {
        ready = await prepare(item)
      } catch (e) {
        return deps.notify.error(`${item.name} could not be prepared`, message(e))
      }
      const centre = deps.view.centre()
      const found = centre ? place(ready, centre.x, centre.y, true, 0) : null
      const ground: PlacementTarget = { kind: "surface", point: [0, 0, 0], normal: [0, 1, 0] }
      insert(ready, found?.pose ?? placePose(ready.def.manifest, ready.assets, ground, 0))
    },
    cancel: stop,
  }
}

export type InsertionController = ReturnType<typeof createInsertionController>
