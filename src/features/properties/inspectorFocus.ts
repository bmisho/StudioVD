import type { AnchorId, MateId, PartId } from "@/core/schema"

/** The id of a part's "Anchors" heading in its inspector. */
export const anchorListId = (partId: PartId) => `part-anchors-${partId}`

/** The id of the anchor inspector's heading. */
export const anchorHeadingId = (id: AnchorId) => `anchor-heading-${id}`

/** The id of the mate inspector's heading. */
export const mateHeadingId = (id: MateId) => `mate-heading-${id}`

/** Focuses an element once the inspector showing it has rendered (the next frame). */
const focusLater = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus())

/** Moves focus to a part's anchor list (after deleting one of them, or "back to the part"). */
export const focusAnchorList = (partId: PartId) => focusLater(anchorListId(partId))

/** Moves focus to an anchor's inspector (after picking it from its part's list). */
export const focusAnchorInspector = (id: AnchorId) => focusLater(anchorHeadingId(id))

/**
 * On the next frame, if the control that had focus went away (a button that hides once it has
 * done its work), focuses the element with `id` instead of leaving focus on <body>.
 */
export const rescueFocusTo = (id: string) =>
  requestAnimationFrame(() => {
    const active = document.activeElement
    if (!active || active === document.body || !active.isConnected)
      document.getElementById(id)?.focus()
  })

/** A heading that takes focus from code (tabIndex -1): its ring shows for keyboard users. */
export const FOCUSABLE_HEADING =
  "rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
