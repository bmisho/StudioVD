import type { Anchor, AnchorId, PartId } from "@/core/schema"
import { anchorsByPart } from "./anchorIndex"

/**
 * Most anchor glyphs drawn at once. Each is a handful of meshes redrawn, sorted and rescaled
 * every frame, so a file with thousands of anchors would stall the view without a cap.
 */
export const MAX_GLYPHS = 500

/**
 * Which anchors get glyphs (PLAN 7.4), per part: on the parts that show theirs (in the order
 * given), the selected anchors first, then one of each part's in turn, so every part shows
 * some, until MAX_GLYPHS. Linear in the anchors shown plus parts × rounds.
 */
export function glyphPlan(
  anchors: Readonly<Record<AnchorId, Anchor>>,
  showing: readonly PartId[],
  selected: ReadonlySet<AnchorId>,
  max = MAX_GLYPHS
): Map<PartId, AnchorId[]> {
  const plan = new Map<PartId, AnchorId[]>()
  const taken = new Set<AnchorId>()
  const shownParts = new Set(showing)
  const take = (a: Anchor) => {
    const list = plan.get(a.partId)
    if (list) list.push(a.id)
    else plan.set(a.partId, [a.id])
    taken.add(a.id)
  }
  for (const id of selected) {
    if (taken.size >= max) return plan
    const a = Object.hasOwn(anchors, id) ? anchors[id] : undefined
    if (a && shownParts.has(a.partId)) take(a)
  }
  const index = anchorsByPart(anchors)
  const lists = [...shownParts].map((p) => index.get(p) ?? [])
  for (let round = 0; taken.size < max; round++) {
    let more = false
    for (const list of lists) {
      const a = list[round]
      if (!a) continue
      more = true
      if (!taken.has(a.id)) take(a)
      if (taken.size >= max) break
    }
    if (!more) break
  }
  return plan
}
