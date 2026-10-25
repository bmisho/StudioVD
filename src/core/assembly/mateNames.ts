import { COLLECTION_CAPS, type MateType } from "@/core/schema"
import type { MateIssue } from "./assemblyGraph"
import type { SnapRefusal } from "./mateSnap"

/** What each mate type leaves free, for pickers and lists. */
export const MATE_TYPES: readonly { type: MateType; label: string; hint: string }[] = [
  { type: "fixed", label: "Fixed", hint: "Moves with the other part" },
  { type: "revolute", label: "Revolute", hint: "Turns about the axis (a hinge)" },
  { type: "prismatic", label: "Prismatic", hint: "Slides along the axis" },
  { type: "spherical", label: "Spherical", hint: "Turns about the point (a ball joint)" },
]

export const mateTypeLabel = (type: MateType): string =>
  MATE_TYPES.find((t) => t.type === type)?.label ?? type

/** Why the Mate tool cannot snap, in words for the user. */
export const REFUSAL_TEXT: Record<SnapRefusal, string> = {
  missing: "One of the anchors is gone.",
  samePart: "Both anchors are on one part: pick an anchor on another part.",
  grounded:
    "Both parts are fixed to the ground (grounded, or fixed-mated to a grounded part): unground one first.",
  tooFar: "Snapping would move a part more than 100 km from the origin.",
}

/** A mate's issues, in words (PLAN 8.4). */
export const ISSUE_TEXT: Record<MateIssue, string> = {
  suppressed: "Suppressed: it holds nothing until turned back on.",
  bothGrounded: "Both parts are fixed to the ground: this mate can move nothing.",
  redundant: "Its parts are already fixed together: this mate adds nothing.",
  closesLoop: "Closes a loop: its parts were already joined through other mates.",
  unsatisfied: "Not satisfied: its parts do not stand where it puts them.",
}

/** Issues that likely need the user (the warning colour and the tree's triangle). */
export const WARNING_ISSUES: ReadonlySet<MateIssue> = new Set<MateIssue>([
  "bothGrounded",
  "redundant",
  "unsatisfied",
])

/** Why a new mate cannot be added, besides snapping. */
export const ADD_REFUSAL_TEXT = {
  full: `The project holds as many mates as a file may (${COLLECTION_CAPS.mates.toLocaleString("en-US")}).`,
  invalid: "The mate's values are out of range.",
} as const

/** A new mate whose parts are already joined (it closes a loop). */
export const LOOP_TEXT =
  "Its parts are already joined, through other mates or the ground: nothing moves."

/** A mate that does not hold, in a loop: snapping cannot move its parts. */
export const RESNAP_LOOP_TEXT =
  "Snap again cannot help: other mates hold its parts where they are. Change this mate or those, or suppress it."
