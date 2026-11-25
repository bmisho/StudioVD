import type { RootState, ThreeEvent } from "@react-three/fiber"
import { uniqueAnchorName } from "@/core/assembly/anchorNames"
import { isPlainClick } from "@/core/scene/pickPolicy"
import { MAX_CABLE_VIA, type AnchorId, type ConnectorId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { documentHistory } from "@/store/document/history"
import { useAnchorTarget } from "@/store/session/anchorTargetStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { anchorPreview, type AnchorPreview } from "./anchorPreviewStore"
import { candidateFromHit } from "./candidateFromHit"

const cursorOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => ({
  x: e.nativeEvent.clientX,
  y: e.nativeEvent.clientY,
})
const store = () => useDocumentStore.getState()

/** The part an anchor being placed again must stay on (null: any part will do). */
function partOfTarget() {
  const target = useAnchorTarget.getState().target
  if (target?.kind !== "move") return null
  const doc = store().doc
  return Object.hasOwn(doc.anchors, target.anchor) ? doc.anchors[target.anchor]?.partId : null
}

/**
 * Pointer move over a part with Place Anchor active: preview what a click would place (only on
 * its own part while an anchor is placed again).
 */
export function previewAnchor(e: ThreeEvent<PointerEvent>, state: RootState): void {
  // Not while orbiting or panning: the preview would chase the moving view.
  const preview = e.nativeEvent.buttons === 0 ? candidateFromHit(e, cursorOf(e), state) : null
  const only = partOfTarget()
  anchorPreview.set(preview && (!only || preview.partId === only) ? preview : null)
}

/** Adds the previewed anchor to its part, named apart from the part's others; returns it. */
export function placeAnchor({ partId, candidate }: AnchorPreview, name = candidate.name) {
  const doc = store().doc
  const names = Object.values(doc.anchors).flatMap((a) =>
    a.partId === partId && a.name ? [a.name] : []
  )
  return store().addAnchor({
    partId,
    kind: candidate.kind,
    frame: candidate.frame,
    source: candidate.source,
    name: uniqueAnchorName(name, names),
  })
}

/**
 * Puts an existing anchor where the tool snapped, on its own part: name, interface tag and a
 * component's record of it stay (mates on it then show whether they still hold). False when
 * the click was on another part.
 */
export function moveAnchor(id: AnchorId, { partId, candidate }: AnchorPreview): boolean {
  const doc = store().doc
  const anchor = Object.hasOwn(doc.anchors, id) ? doc.anchors[id] : undefined
  if (anchor?.partId !== partId) return false
  store().updateAnchor(id, {
    kind: candidate.kind,
    frame: candidate.frame,
    ...(anchor.source.kind !== "component" && { source: candidate.source }),
  })
  return true
}

/** A waypoint where the tool snapped, added at the end of the cable's route: one undo step. */
export function addWaypoint(cable: ConnectorId, preview: AnchorPreview): boolean {
  const doc = store().doc
  const c = Object.hasOwn(doc.connectors, cable) ? doc.connectors[cable] : undefined
  if (c?.kind !== "cable" || c.via.length >= MAX_CABLE_VIA) return false
  const token = documentHistory.beginGesture()
  const id = placeAnchor(preview, "Waypoint")
  if (id) store().setCableVia(cable, [...c.via, id])
  documentHistory.endGesture(token)
  return id !== null
}

/**
 * Primary click on a part with Place Anchor active (PLAN 7.2): places the anchor under the
 * cursor, recomputed at the click (the last preview may be a frame old), selects it and goes
 * back to Select, so a later click on a part selects it instead of placing more (0.2.1 first-run
 * report); Shift+click keeps the tool on for the next one. With a target, the click moves that
 * anchor (then the tool ends) or lays the cable's next waypoint (the cable stays selected).
 */
export function clickAnchor(e: ThreeEvent<MouseEvent>, state: RootState): void {
  // Not a drag, and not a double click's second click (it would place the same anchor again).
  if (!isPlainClick(e.nativeEvent, e.delta)) return
  const preview = candidateFromHit(e, cursorOf(e), state)
  if (!preview) return
  const target = useAnchorTarget.getState().target
  const session = useSessionStore.getState()
  if (target?.kind === "move") {
    if (!moveAnchor(target.anchor, preview)) return
    session.select([{ kind: "anchor", id: target.anchor }])
    session.setTool("select")
  } else if (target?.kind === "route") {
    if (addWaypoint(target.cable, preview))
      session.select([{ kind: "connector", id: target.cable }])
  } else {
    const id = placeAnchor(preview)
    if (!id) return
    session.select([{ kind: "anchor", id }])
    if (!e.nativeEvent.shiftKey) session.setTool("select")
  }
}
