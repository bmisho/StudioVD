import { connectorAnchors } from "@/core/schema/connector"
import type { Anchor, AnchorId, Mate, Part, PartId, SceneDocument } from "@/core/schema"

/** Most parts one component holds (PLAN 4.3). */
export const MAX_COMPONENT_PARTS = 64

/** What Save as component takes from the selection (PLAN 9.7). */
export interface UserComponentPlan {
  parts: Part[]
  /** Its frame is the component's: the first grounded part, else the first selected. */
  root: Part
  /** Every anchor on the parts. */
  anchors: Anchor[]
  /** Mates with both anchors on the parts (suppressed ones stay out). */
  mates: Mate[]
  skipped: { externalMates: number; suppressedMates: number; connectors: number }
}

/** The plan for `partIds`, or why there is none. */
export function planUserComponent(
  doc: SceneDocument,
  partIds: readonly PartId[]
): UserComponentPlan | string {
  const parts = [...new Set(partIds)].flatMap((id) =>
    Object.hasOwn(doc.parts, id) ? [doc.parts[id] as Part] : []
  )
  const root = parts.find((p) => p.grounded) ?? parts[0]
  if (!root) return "Select the parts to save as a component."
  if (parts.length > MAX_COMPONENT_PARTS)
    return `A component holds at most ${MAX_COMPONENT_PARTS} parts; ${parts.length} are selected.`
  const inside = new Set<string>(parts.map((p) => p.id))
  const anchors = Object.values(doc.anchors).filter((a) => inside.has(a.partId))
  const ours = new Set<AnchorId>(anchors.map((a) => a.id))
  const skipped = { externalMates: 0, suppressedMates: 0, connectors: 0 }
  const mates: Mate[] = []
  for (const m of Object.values(doc.mates)) {
    const [a, b] = [ours.has(m.anchorA), ours.has(m.anchorB)]
    if (!a && !b) continue
    if (!a || !b) skipped.externalMates++
    else if (m.suppressed) skipped.suppressedMates++
    else mates.push(m)
  }
  skipped.connectors = Object.values(doc.connectors).filter((c) =>
    connectorAnchors(c).some((id) => ours.has(id))
  ).length
  return { parts, root, anchors, mates, skipped }
}
