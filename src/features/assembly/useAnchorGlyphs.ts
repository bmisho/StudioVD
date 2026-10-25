import { useMemo } from "react"
import { glyphPlan } from "@/core/assembly/glyphPlan"
import { suggestedAnchors } from "@/core/assembly/suggestions"
import type { AnchorId, PartId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"

/** In a part's glyph list, the mark before an id: drawn selected, or as a suggestion. */
export const SELECTED_MARK = "s:"
export const SUGGESTED_MARK = "g:"

/**
 * Per mounted part, the anchors that get glyphs (PLAN 7.4, 8.2, 8.5), as their ids joined
 * (marked when selected or suggested): a string, so each part view compares its share by
 * value and only the parts whose share changed re-render. Shown: every part's while a tool
 * that works with anchors is on (Place Anchor, Mate), else those of the selected parts
 * (directly or through a group) and of the parts of selected anchors and mates. Selected:
 * selected anchors and a selected mate's two, or while mating only the Mate tool's picks (the
 * selection stays as it was). Suggested: while the Mate tool waits for its second pick,
 * anchors on other mounted parts whose interface tags fit the first (`suggestedAnchors`, as
 * the hint counts them). All within the budget of `glyphPlan`, those two kinds first.
 */
export function useAnchorGlyphs(
  mounted: readonly PartId[],
  highlighted: ReadonlySet<string>
): ReadonlyMap<PartId, string> {
  const anchors = useDocumentStore((s) => s.doc.anchors)
  const mates = useDocumentStore((s) => s.doc.mates)
  const selection = useSessionStore((s) => s.selection)
  const draft = useSessionStore((s) => s.mateDraft)
  const everyPart = useSessionStore((s) => s.activeTool !== "select")
  const mating = useSessionStore((s) => s.activeTool === "mate")
  return useMemo(() => {
    const selected = new Set<AnchorId>()
    for (const item of mating ? [] : selection) {
      if (item.kind === "anchor") selected.add(item.id)
      const mate = item.kind === "mate" && Object.hasOwn(mates, item.id) ? mates[item.id] : null
      if (mate) [mate.anchorA, mate.anchorB].forEach((id) => selected.add(id))
    }
    if (draft) [draft.anchorA, draft.anchorB].forEach((id) => id && selected.add(id))
    const isMounted = new Set<PartId>(mounted)
    const suggested = new Set(
      draft && !draft.anchorB
        ? suggestedAnchors(anchors, draft.anchorA, (id) => isMounted.has(id))
        : []
    )

    const own = new Set(mounted.filter((id) => highlighted.has(id)))
    for (const id of selected) {
      const anchor = Object.hasOwn(anchors, id) ? anchors[id] : undefined
      if (anchor && isMounted.has(anchor.partId)) own.add(anchor.partId)
    }
    const showing = everyPart ? [...own, ...mounted.filter((id) => !own.has(id))] : [...own]
    const plan = glyphPlan(anchors, showing, new Set([...selected, ...suggested]))
    const mark = (id: AnchorId) =>
      (selected.has(id) ? SELECTED_MARK : suggested.has(id) ? SUGGESTED_MARK : "") + id
    return new Map([...plan].map(([part, ids]) => [part, ids.map(mark).join(",")]))
  }, [anchors, mates, selection, draft, everyPart, mating, mounted, highlighted])
}
