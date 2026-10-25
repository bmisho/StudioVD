import { useMemo } from "react"
import { partShown } from "@/core/scene/partShown"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { GhostPart } from "./GhostPart"
import { useMateDraftPlan } from "./useMateDraftPlan"

/** Ghosts drawn at most: a whole sub-assembly can move (the hint names how many parts). */
export const MAX_GHOSTS = 200

/**
 * The Mate tool's live preview (PLAN 8.2): once both anchors are picked, the parts the mate
 * would move, see-through where they would go, as the 3D view shows parts (none hidden or
 * outside View › Isolate). Nothing moves until Apply.
 */
export function MatePreview() {
  const { plan } = useMateDraftPlan()
  const parts = useDocumentStore((s) => s.doc.parts)
  const isolated = useSessionStore((s) => s.isolated)
  const ghosts = useMemo(() => {
    if (!plan?.ok) return []
    const shown = isolated ? new Set<string>(isolated) : null
    return [...plan.poses]
      .filter(([id]) => {
        const part = Object.hasOwn(parts, id) ? parts[id] : undefined
        return part && partShown(part, shown)
      })
      .slice(0, MAX_GHOSTS)
  }, [plan, parts, isolated])
  return ghosts.map(([id, pose]) => <GhostPart key={id} partId={id} pose={pose} />)
}
