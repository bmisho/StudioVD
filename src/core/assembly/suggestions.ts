import type { Anchor, AnchorId, PartId, SceneDocument } from "@/core/schema"
import { fitKeys } from "./interfaceTags"

type Anchors = SceneDocument["anchors"]

const indexes = new WeakMap<Anchors, Map<string, Anchor[]>>()

/** Anchors by their tag's own fit key: built once per anchors record, shared by its users. */
function fitIndex(anchors: Anchors): Map<string, Anchor[]> {
  const known = indexes.get(anchors)
  if (known) return known
  const index = new Map<string, Anchor[]>()
  for (const anchor of Object.values(anchors)) {
    const keys = fitKeys(anchor.interface)
    if (!keys) continue
    const list = index.get(keys.own)
    if (list) list.push(anchor)
    else index.set(keys.own, [anchor])
  }
  indexes.set(anchors, index)
  return index
}

/**
 * What the Mate tool suggests for its first pick (PLAN 8.2): anchors on other parts the 3D
 * view shows whose interface tags fit the pick's (`tagsFit`). A lookup, not a scan of every
 * anchor, so the glyphs and the hint can both ask.
 */
export function suggestedAnchors(
  anchors: Anchors,
  firstId: AnchorId,
  shown: (partId: PartId) => boolean
): AnchorId[] {
  const first = Object.hasOwn(anchors, firstId) ? anchors[firstId] : undefined
  const keys = first && fitKeys(first.interface)
  if (!first || !keys) return []
  const fits = fitIndex(anchors).get(keys.fits) ?? []
  return fits.filter((a) => a.partId !== first.partId && shown(a.partId)).map((a) => a.id)
}
