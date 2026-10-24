import type { Anchor, AnchorId, PartId } from "@/core/schema"

type Anchors = Readonly<Record<AnchorId, Anchor>>
const cache = new WeakMap<Anchors, ReadonlyMap<PartId, readonly Anchor[]>>()
const NONE: readonly Anchor[] = []

/**
 * Anchors grouped by part, in document order: one pass per `doc.anchors` (immer gives each
 * change a new record), shared by every caller. A filter per part would cost parts × anchors
 * on every change, seconds for a file at the schema's limits.
 */
export function anchorsByPart(anchors: Anchors): ReadonlyMap<PartId, readonly Anchor[]> {
  let index = cache.get(anchors)
  if (!index) {
    const map = new Map<PartId, Anchor[]>()
    for (const anchor of Object.values(anchors)) {
      const list = map.get(anchor.partId)
      if (list) list.push(anchor)
      else map.set(anchor.partId, [anchor])
    }
    cache.set(anchors, (index = map))
  }
  return index
}

/** One part's anchors, in document order. */
export const anchorsOf = (anchors: Anchors, partId: PartId): readonly Anchor[] =>
  anchorsByPart(anchors).get(partId) ?? NONE
