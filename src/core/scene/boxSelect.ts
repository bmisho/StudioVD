import type { ComponentInstanceId, PartId, SceneDocument } from "@/core/schema"
import { pickTarget } from "./componentPick"
import type { SelectionRef } from "./selection"

/** A rectangle on the screen, in client px, left ≤ right and top ≤ bottom. */
export interface ScreenRect {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * How a box selects (the SolidWorks convention): dragged rightward, only what lies entirely
 * inside it ("window"); dragged leftward, everything it touches ("crossing").
 */
export type BoxMode = "window" | "crossing"

export interface Box {
  rect: ScreenRect
  mode: BoxMode
}

/** The box between where the drag started and where the pointer is now. */
export function boxBetween(from: { x: number; y: number }, to: { x: number; y: number }): Box {
  return {
    rect: {
      left: Math.min(from.x, to.x),
      top: Math.min(from.y, to.y),
      right: Math.max(from.x, to.x),
      bottom: Math.max(from.y, to.y),
    },
    mode: to.x >= from.x ? "window" : "crossing",
  }
}

const inside = (r: ScreenRect, box: ScreenRect) =>
  r.left >= box.left && r.right <= box.right && r.top >= box.top && r.bottom <= box.bottom
const overlaps = (r: ScreenRect, box: ScreenRect) =>
  r.left <= box.right && r.right >= box.left && r.top <= box.bottom && r.bottom >= box.top

/**
 * The parts a box catches, given where each visible part lies on the screen (the bounds of its
 * projected mesh; null when part of it is behind the camera, which a window cannot hold but a
 * crossing box still may touch, so those are left out to keep the rule simple).
 */
export function partsInBox(box: Box, screen: ReadonlyMap<PartId, ScreenRect | null>): PartId[] {
  const test = box.mode === "window" ? inside : overlaps
  return [...screen].flatMap(([id, r]) => (r && test(r, box.rect) ? [id] : []))
}

/**
 * What the caught parts select: each part, or the library component it belongs to as a whole
 * (unless that is the component entered), once each and in document order.
 */
export function boxSelection(
  doc: Pick<SceneDocument, "parts" | "components">,
  parts: readonly PartId[],
  entered: ComponentInstanceId | null
): SelectionRef[] {
  const seen = new Set<string>()
  const out: SelectionRef[] = []
  for (const id of parts) {
    const target = pickTarget<SelectionRef>(doc, { kind: "part", id }, entered)
    if (!target || seen.has(`${target.kind}:${target.id}`)) continue
    seen.add(`${target.kind}:${target.id}`)
    out.push(target)
  }
  return out
}
