import type { SceneDocument } from "@/core/schema"
import { blockLayout, GRID } from "./layout"

interface Box {
  x: number
  y: number
  width: number
  height: number
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width + GRID &&
  b.x < a.x + a.width + GRID &&
  a.y < b.y + b.height + GRID &&
  b.y < a.y + a.height + GRID

/** Grid offsets in rings around the origin, nearest first (ring 0 is the origin itself). */
function* rings(max: number): Generator<[number, number]> {
  yield [0, 0]
  for (let r = 1; r <= max; r++) {
    const ring: [number, number][] = []
    for (let i = -r; i <= r; i++)
      for (let j = -r; j <= r; j++) if (Math.max(Math.abs(i), Math.abs(j)) === r) ring.push([i, j])
    ring.sort((a, b) => Math.hypot(...a) - Math.hypot(...b))
    yield* ring
  }
}

/**
 * Where a new block of `size` goes (PLAN 11.1): centred on `at`, on the grid, else the free
 * spot nearest to that (a grid's gap from every block), so it lands in view.
 */
export function freeSpot(
  doc: Pick<SceneDocument, "schematic">,
  size: { width: number; height: number },
  at: { x: number; y: number }
): { x: number; y: number } {
  const snap = (v: number) => Math.round(v / GRID) * GRID
  const boxes: Box[] = Object.values(doc.schematic.nodes).flatMap((n) => {
    const def = doc.schematic.blockDefs[n.blockDefId]
    if (!def) return []
    const { width, height } = blockLayout(def)
    return [{ ...n.position, width, height }]
  })
  const start = { x: snap(at.x - size.width / 2), y: snap(at.y - size.height / 2) }
  const step = 2 * GRID
  for (const [i, j] of rings(24)) {
    const spot = { x: start.x + i * step, y: start.y + j * step }
    if (!boxes.some((b) => overlaps(b, { ...spot, ...size }))) return spot
  }
  return start
}
