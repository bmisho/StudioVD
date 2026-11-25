import type { AnchorId } from "@/core/schema"
import { fitTiesOn } from "@/features/library/tieFit"
import { useDocumentStore } from "@/store/document/documentStore"
import { useAnchorTarget } from "@/store/session/anchorTargetStore"
import { useSessionStore, type SelectionItem } from "@/store/session/sessionStore"

/** A zip tie's, tie mount's or clip's anchor: a cable goes through it, not to it. */
const THROUGH = "Cable through"

const setRoute = (route: readonly AnchorId[]) =>
  useAnchorTarget.setState({ target: { kind: "cable", route } })

const shown = (route: readonly AnchorId[]): SelectionItem[] =>
  route.map((id) => ({ kind: "anchor", id }))

/**
 * The Cable tool's pick of an anchor (0.2.2): the first is where the cable starts, a zip tie's
 * "Cable through" is a waypoint, any other ends it. The cable is made fitted to its route (one
 * undo step), selected, and the ties it runs through sized to what they now hold; the tool
 * stays on for the next cable.
 */
export function cableToolPick(picked: AnchorId): void {
  const target = useAnchorTarget.getState().target
  if (target?.kind !== "cable" || target.route.includes(picked)) return
  const session = useSessionStore.getState()
  const route = target.route
  const anchors = useDocumentStore.getState().doc.anchors
  const through = Object.hasOwn(anchors, picked) && anchors[picked]?.name === THROUGH
  if (route.length === 0 || through) {
    const next = [...route, picked]
    setRoute(next)
    session.select(shown(next))
    return
  }
  const id = useDocumentStore.getState().addConnector("cable", [...route, picked])
  setRoute([])
  if (!id) return
  session.select([{ kind: "connector", id }])
  void fitTiesOn(route.slice(1))
}
