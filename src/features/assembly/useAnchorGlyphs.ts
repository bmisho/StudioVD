import { useMemo } from "react"
import { glyphPlan } from "@/core/assembly/glyphPlan"
import type { AnchorId, PartId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"

/**
 * Per mounted part, the anchors that get glyphs (PLAN 7.4), as their ids joined: a string,
 * so each part view compares its share by value and only the parts whose share changed
 * re-render. Shown: every part's while a tool that works with anchors is on (Place Anchor,
 * Mate), else those of the selected parts (directly or through a group) and of the parts of
 * selected anchors; selected parts first, within the budget of `glyphPlan`.
 */
export function useAnchorGlyphs(
  mounted: readonly PartId[],
  highlighted: ReadonlySet<string>
): ReadonlyMap<PartId, string> {
  const anchors = useDocumentStore((s) => s.doc.anchors)
  const selection = useSessionStore((s) => s.selection)
  const everyPart = useSessionStore((s) => s.activeTool !== "select")
  return useMemo(() => {
    const selected = new Set<AnchorId>()
    for (const item of selection) if (item.kind === "anchor") selected.add(item.id)
    const isMounted = new Set(mounted)
    const own = new Set(mounted.filter((id) => highlighted.has(id)))
    for (const id of selected) {
      const anchor = Object.hasOwn(anchors, id) ? anchors[id] : undefined
      if (anchor && isMounted.has(anchor.partId)) own.add(anchor.partId)
    }
    const showing = everyPart ? [...own, ...mounted.filter((id) => !own.has(id))] : [...own]
    const plan = glyphPlan(anchors, showing, selected)
    return new Map([...plan].map(([part, ids]) => [part, ids.join(",")]))
  }, [anchors, selection, everyPart, mounted, highlighted])
}
