import type { RootState, ThreeEvent } from "@react-three/fiber"
import { uniqueAnchorName } from "@/core/assembly/anchorNames"
import { CLICK_SLOP_PX } from "@/core/scene/pickPolicy"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { anchorPreview, type AnchorPreview } from "./anchorPreview"
import { candidateFromHit } from "./candidateFromHit"

const cursorOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => ({
  x: e.nativeEvent.clientX,
  y: e.nativeEvent.clientY,
})

/** Pointer move over a part with Place Anchor active: preview what a click would place. */
export function previewAnchor(e: ThreeEvent<PointerEvent>, state: RootState): void {
  // Not while orbiting or panning: the preview would chase the moving view.
  anchorPreview.set(e.nativeEvent.buttons === 0 ? candidateFromHit(e, cursorOf(e), state) : null)
}

/** Adds the previewed anchor to its part, named apart from the part's others, and selects it. */
export function placeAnchor({ partId, candidate }: AnchorPreview): void {
  const doc = useDocumentStore.getState().doc
  const names = Object.values(doc.anchors).flatMap((a) =>
    a.partId === partId && a.name ? [a.name] : []
  )
  const id = useDocumentStore.getState().addAnchor({
    partId,
    kind: candidate.kind,
    frame: candidate.frame,
    source: candidate.source,
    name: uniqueAnchorName(candidate.name, names),
  })
  if (id) useSessionStore.getState().select([{ kind: "anchor", id }])
}

/**
 * Primary click on a part with Place Anchor active (PLAN 7.2): places the anchor under the
 * cursor, recomputed at the click (the last preview may be a frame old). The tool stays on.
 */
export function clickAnchor(e: ThreeEvent<MouseEvent>, state: RootState): void {
  const n = e.nativeEvent
  // A double click's second click would place the same anchor again.
  if (n.type !== "click" || n.button !== 0 || n.detail > 1 || e.delta > CLICK_SLOP_PX) return
  const preview = candidateFromHit(e, cursorOf(e), state)
  if (preview) placeAnchor(preview)
}
