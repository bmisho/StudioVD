import { GhostPart } from "./GhostPart"
import { useMateDraftPlan } from "./useMateDraftPlan"

/**
 * The Mate tool's live preview (PLAN 8.2): once both anchors are picked, every part the mate
 * would move, see-through where it would go. Nothing moves until Apply.
 */
export function MatePreview() {
  const { plan } = useMateDraftPlan()
  if (!plan?.ok) return null
  return [...plan.poses].map(([id, pose]) => <GhostPart key={id} partId={id} pose={pose} />)
}
