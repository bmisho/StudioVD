import type { PartId } from "@/core/schema"

/** The id of a part's "Anchors" heading in its inspector. */
export const anchorListId = (partId: PartId) => `part-anchors-${partId}`

/** Moves focus to a part's anchor list once it has rendered (after deleting one of them). */
export function focusAnchorList(partId: PartId): void {
  requestAnimationFrame(() => document.getElementById(anchorListId(partId))?.focus())
}
