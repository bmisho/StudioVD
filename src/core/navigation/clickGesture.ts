export interface PointerSample {
  x: number
  y: number
  /** Milliseconds. */
  t: number
}

/** A press and release within `slopPx` of each other count as a click, not a drag. */
export function isClick(down: PointerSample, up: PointerSample, slopPx = 4): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= slopPx
}

/** Second click of a double click: soon after the previous click and near it. */
export function isDoubleClick(
  previous: PointerSample | null,
  click: PointerSample,
  maxMs = 500,
  slopPx = 4
): boolean {
  if (!previous) return false
  return (
    click.t - previous.t <= maxMs &&
    Math.hypot(click.x - previous.x, click.y - previous.y) <= slopPx
  )
}
