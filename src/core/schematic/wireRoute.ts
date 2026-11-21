import { GRID } from "./layout"
import type { Side } from "./layout"

/** A port's place and side, and the top of its block (wires that turn back go over it). */
type End = { x: number; y: number; side: Side; top: number }
type Point = [number, number]

const OUT: Record<Side, Point> = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] }

/**
 * An orthogonal wire between two ports (PLAN 11.8 export): out of each port by a grid step,
 * then across with at most two bends. The canvas routes its own (React Flow's smooth steps).
 */
export function wirePoints(a: End, b: End): Point[] {
  const [da, db] = [OUT[a.side], OUT[b.side]]
  const p1: Point = [a.x + da[0] * GRID, a.y + da[1] * GRID]
  const p2: Point = [b.x + db[0] * GRID, b.y + db[1] * GRID]
  const horizontal = (d: Point) => d[0] !== 0
  let middle: Point[]
  if (horizontal(da) && horizontal(db)) {
    const xm = (p1[0] + p2[0]) / 2
    // Going across would run back through a block: go over both blocks instead.
    const back = (xm - p1[0]) * da[0] < 0 || (xm - p2[0]) * db[0] < 0
    const over = Math.min(a.top, b.top) - GRID
    middle = back
      ? [
          [p1[0], over],
          [p2[0], over],
        ]
      : [
          [xm, p1[1]],
          [xm, p2[1]],
        ]
  } else if (!horizontal(da) && !horizontal(db)) {
    const ym = (p1[1] + p2[1]) / 2
    middle = [
      [p1[0], ym],
      [p2[0], ym],
    ]
  } else middle = horizontal(da) ? [[p2[0], p1[1]]] : [[p1[0], p2[1]]]
  return [[a.x, a.y], p1, ...middle, p2, [b.x, b.y]]
}
