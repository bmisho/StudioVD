import { useCallback, useMemo } from "react"
import type { Group } from "three"
import { useShallow } from "zustand/react/shallow"
import type { Anchor, AnchorId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { AnchorGlyph } from "./AnchorGlyph"
import { registerGlyph } from "./glyphs"

function PlacedGlyph({ anchor, selected }: { anchor: Anchor; selected: boolean }) {
  const register = useCallback(
    (group: Group | null) => (group ? registerGlyph(group, anchor.id) : undefined),
    [anchor.id]
  )
  return <AnchorGlyph frame={anchor.frame} kind={anchor.kind} selected={selected} ref={register} />
}

/**
 * A part's anchor glyphs (PLAN 7.4), children of the part's group so they follow it (test
 * mode too). Which anchors, if any, is decided for all parts at once (`useAnchorGlyphs`):
 * `ids` is this part's share, joined.
 */
export function PartAnchors({ ids }: { ids: string }) {
  const list = useMemo(() => (ids ? (ids.split(",") as AnchorId[]) : []), [ids])
  const anchors = useDocumentStore(
    useShallow((s) =>
      list.flatMap((id) => {
        const anchor = Object.hasOwn(s.doc.anchors, id) ? s.doc.anchors[id] : undefined
        return anchor ? [anchor] : []
      })
    )
  )
  const selectedAnchor = useSessionStore((s) => {
    const only = s.selection.length === 1 ? s.selection[0] : undefined
    return only?.kind === "anchor" ? only.id : null
  })
  return anchors.map((a) => (
    <PlacedGlyph key={a.id} anchor={a} selected={a.id === selectedAnchor} />
  ))
}
