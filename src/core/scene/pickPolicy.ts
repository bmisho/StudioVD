import type { SelectionRef } from "@/core/scene/selection"

/**
 * Largest pointer travel (CSS px, rounded Euclidean, pointerdown -> click) that still counts
 * as a click. It equals R3F 9's hard-coded miss threshold (`if (delta <= 2)` before
 * `onPointerMissed`), so a jittery click on a part and on empty space behave the same.
 */
export const CLICK_SLOP_PX = 2

/**
 * A plain primary click, as the tools take it: not a drag (moved at most CLICK_SLOP_PX), not
 * another button, and not the second click of a double click (that would act twice).
 */
export function isPlainClick(
  e: { type: string; button: number; detail?: number },
  movedPx: number
): boolean {
  return e.type === "click" && e.button === 0 && movedPx <= CLICK_SLOP_PX && (e.detail ?? 1) <= 1
}

export interface ViewportClick<T extends SelectionRef> {
  /** DOM event type. R3F also reports right-click (`contextmenu`) and `dblclick` as misses. */
  type: string
  /** MouseEvent.button: 0 primary. WebKit may report middle clicks as `click`, so check it. */
  button: number
  /** R3F `ThreeEvent.delta`; misses pass 0 (R3F already dropped misses with delta > 2). */
  delta: number
  /** Ctrl (or Meta) held: same additive rule as the scene tree. */
  additive: boolean
  /** What was clicked, or null for empty space. */
  target: T | null
}

export type SelectionChange<T> =
  { type: "none" } | { type: "replace"; item: T } | { type: "toggle"; item: T } | { type: "clear" }

/** Click in the 3D viewport -> selection change (select tool). Pure; unit tested. */
export function selectionChangeForClick<T extends SelectionRef>(
  click: ViewportClick<T>
): SelectionChange<T> {
  if (click.type !== "click" || click.button !== 0 || click.delta > CLICK_SLOP_PX) {
    return { type: "none" }
  }
  if (click.target === null) return click.additive ? { type: "none" } : { type: "clear" }
  return click.additive
    ? { type: "toggle", item: click.target }
    : { type: "replace", item: click.target }
}

/** Pre-highlight only while no button is held (orbit, pan and drags must not flicker it). */
export function hoverTargetForMove<T>(buttons: number, target: T): T | null {
  return buttons === 0 ? target : null
}

/**
 * Whether a periodic hover refresh (test mode: parts move under a still cursor) is due.
 * A clock that went backwards (R3F resets its clock whenever the frameloop changes) makes it
 * due at once instead of stalling until the new clock catches up with the old timestamp.
 */
export function periodicRefreshDue(nowMs: number, lastMs: number, periodMs?: number): boolean {
  if (periodMs === undefined) return false
  return nowMs < lastMs || nowMs - lastMs >= periodMs
}
