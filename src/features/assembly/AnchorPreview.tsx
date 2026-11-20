import { useCallback, useSyncExternalStore } from "react"
import type { Group } from "three"
import type { PartId } from "@/core/schema"
import { OVERLAY } from "@/features/viewport/thumbnail/overlay"
import { AnchorGlyph } from "./AnchorGlyph"
import { anchorPreview } from "./anchorPreviewStore"
import { registerGlyph } from "./glyphs"
import { SnapFeatureLine } from "./SnapFeatureLine"

/**
 * The anchor Place Anchor would place on this part (PLAN 7.2): a see-through glyph and the
 * edge or circle it snapped to. A child of the part's group, as its anchors are (part-local);
 * rendered by every part view rather than portalled into the hovered one, since an R3F
 * portal keeps a subscription to the root store after it unmounts.
 */
export function AnchorPreview({ partId }: { partId: PartId }) {
  const preview = useSyncExternalStore(anchorPreview.subscribe, () => {
    const p = anchorPreview.get()
    return p?.partId === partId ? p : null
  })
  const register = useCallback((g: Group | null) => (g ? registerGlyph(g, null) : undefined), [])
  if (!preview) return null
  const { candidate } = preview
  return (
    <group userData={OVERLAY}>
      <AnchorGlyph frame={candidate.frame} kind={candidate.kind} ghost ref={register} />
      {candidate.feature && <SnapFeatureLine feature={candidate.feature} />}
    </group>
  )
}
