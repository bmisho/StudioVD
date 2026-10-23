import { useCallback } from "react"
import type { Group } from "three"
import { useShallow } from "zustand/react/shallow"
import type { Anchor, PartId } from "@/core/schema"
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
 * A part's anchors as glyphs (PLAN 7.4), children of the part's group so they follow it (test
 * mode too). Shown while the part, its group or one of its anchors is selected, and for every
 * part while a tool that works with anchors (Place Anchor, Mate) is active.
 */
export function PartAnchors({ partId, partSelected }: { partId: PartId; partSelected: boolean }) {
  const anchors = useDocumentStore(
    useShallow((s) => Object.values(s.doc.anchors).filter((a) => a.partId === partId))
  )
  const selectedAnchor = useSessionStore((s) => {
    const only = s.selection.length === 1 ? s.selection[0] : undefined
    return only?.kind === "anchor" ? only.id : null
  })
  const shown = useSessionStore(
    (s) =>
      s.activeTool !== "select" ||
      s.selection.some((i) => i.kind === "anchor" && anchors.some((a) => a.id === i.id))
  )
  if (anchors.length === 0 || !(shown || partSelected)) return null
  return anchors.map((a) => (
    <PlacedGlyph key={a.id} anchor={a} selected={a.id === selectedAnchor} />
  ))
}
