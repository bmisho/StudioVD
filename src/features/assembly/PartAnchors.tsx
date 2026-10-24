import { useCallback, useMemo } from "react"
import type { Group } from "three"
import { useShallow } from "zustand/react/shallow"
import type { Anchor, AnchorId } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { AnchorGlyph } from "./AnchorGlyph"
import { registerGlyph } from "./glyphs"
import { SELECTED_MARK, SUGGESTED_MARK } from "./useAnchorGlyphs"

function PlacedGlyph(props: { anchor: Anchor; selected: boolean; suggested: boolean }) {
  const { anchor, selected, suggested } = props
  const register = useCallback(
    (group: Group | null) => (group ? registerGlyph(group, anchor.id) : undefined),
    [anchor.id]
  )
  return (
    <AnchorGlyph
      frame={anchor.frame}
      kind={anchor.kind}
      selected={selected}
      suggested={suggested}
      ref={register}
    />
  )
}

/**
 * A part's anchor glyphs (PLAN 7.4), children of the part's group so they follow it (test
 * mode too). Which anchors, if any, and how each is drawn is decided for all parts at once
 * (`useAnchorGlyphs`): `ids` is this part's share, joined, each marked selected or suggested.
 */
export function PartAnchors({ ids }: { ids: string }) {
  const list = useMemo(
    () =>
      (ids ? ids.split(",") : []).map((entry) => {
        const selected = entry.startsWith(SELECTED_MARK)
        const suggested = entry.startsWith(SUGGESTED_MARK)
        const id = (selected || suggested ? entry.slice(2) : entry) as AnchorId
        return { id, selected, suggested }
      }),
    [ids]
  )
  const anchors = useDocumentStore(
    useShallow((s) =>
      list.flatMap(({ id }) => {
        const anchor = Object.hasOwn(s.doc.anchors, id) ? s.doc.anchors[id] : undefined
        return anchor ? [anchor] : []
      })
    )
  )
  const style = new Map(list.map((e) => [e.id, e]))
  return anchors.map((a) => (
    <PlacedGlyph
      key={a.id}
      anchor={a}
      selected={style.get(a.id)?.selected ?? false}
      suggested={style.get(a.id)?.suggested ?? false}
    />
  ))
}
