import { createPortal } from "@react-three/fiber"
import { useCallback, useEffect, useSyncExternalStore } from "react"
import type { Group } from "three"
import { partObject, subscribePartObjects } from "@/features/viewport/parts/partObjects"
import { OVERLAY } from "@/features/viewport/thumbnail/overlay"
import { useSessionStore } from "@/store/session/sessionStore"
import { AnchorGlyph } from "./AnchorGlyph"
import { anchorPreview } from "./anchorPreview"
import { registerGlyph } from "./glyphs"
import { SnapFeatureLine } from "./SnapFeatureLine"

/**
 * The anchor Place Anchor would place (PLAN 7.2): a see-through glyph and the edge or circle
 * it snapped to, inside the hovered part's group (so it is part-local, like the anchor).
 */
export function AnchorPreview() {
  const placing = useSessionStore((s) => s.activeTool === "anchor")
  const preview = useSyncExternalStore(anchorPreview.subscribe, anchorPreview.get)
  const object = useSyncExternalStore(subscribePartObjects, () =>
    preview ? (partObject(preview.partId) ?? null) : null
  )
  // Leaving the tool (Escape, another tool, test mode) drops what it was showing.
  useEffect(() => {
    if (!placing) anchorPreview.set(null)
  }, [placing])
  const register = useCallback((g: Group | null) => (g ? registerGlyph(g, null) : undefined), [])
  if (!placing || !preview || !object) return null
  const { candidate } = preview
  return createPortal(
    <group userData={OVERLAY}>
      <AnchorGlyph frame={candidate.frame} kind={candidate.kind} ghost ref={register} />
      {candidate.feature && <SnapFeatureLine feature={candidate.feature} />}
    </group>,
    object
  )
}
