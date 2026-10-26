import { estimated } from "../../common"
import type { Vec2 } from "../../mesh/outline"

/** One 20 mm cell's slot: 6.2 wide, lips 1.8 thick, a 45° cavity 4.5 deep (a B-type fit). */
const NOTCH: readonly Vec2[] = [
  [-3.1, 0],
  [-3.1, 1.8],
  [-5.6, 1.8],
  [-2.9, 4.5],
  [2.9, 4.5],
  [5.6, 1.8],
  [3.1, 1.8],
  [3.1, 0],
]
export const TSLOT_BORE = 4.2 // tapped M5 in each cell's core
export const CELL = 20

export const TSLOT_SOURCES = [
  {
    what: "Profile",
    source: estimated(
      "Typical 20 mm B-type 6 mm slot profiles (slot 6.2, lip 1.8, core bore 4.2 for M5); solid corners, so heavier than real (vendors differ)",
      "low"
    ),
  },
]

/**
 * The outline of a T-slot profile `cellsU` × `cellsV` cells of 20 mm, counter-clockwise from
 * its lower left corner, a slot centred on every cell along every side. Returns the slot
 * centres too (side midpoint and outward normal), for anchors.
 */
export function tslotOutline(cellsU: number, cellsV: number) {
  const [A, B] = [(CELL * cellsU) / 2, (CELL * cellsV) / 2]
  const points: Vec2[] = []
  const slots: { at: Vec2; normal: Vec2 }[] = []
  const sides: { start: Vec2; dir: Vec2; inward: Vec2; cells: number }[] = [
    { start: [-A, -B], dir: [1, 0], inward: [0, 1], cells: cellsU },
    { start: [A, -B], dir: [0, 1], inward: [-1, 0], cells: cellsV },
    { start: [A, B], dir: [-1, 0], inward: [0, -1], cells: cellsU },
    { start: [-A, B], dir: [0, -1], inward: [1, 0], cells: cellsV },
  ]
  for (const side of sides) {
    points.push(side.start)
    for (let k = 0; k < side.cells; k++) {
      const s0 = CELL * (k + 0.5)
      const centre: Vec2 = [side.start[0] + side.dir[0] * s0, side.start[1] + side.dir[1] * s0]
      slots.push({ at: centre, normal: [-side.inward[0], -side.inward[1]] })
      for (const [s, t] of NOTCH)
        points.push([
          centre[0] + side.dir[0] * s + side.inward[0] * t,
          centre[1] + side.dir[1] * s + side.inward[1] * t,
        ])
    }
  }
  const cores: Vec2[] = []
  for (let i = 0; i < cellsU; i++)
    for (let j = 0; j < cellsV; j++) cores.push([-A + CELL * (i + 0.5), -B + CELL * (j + 0.5)])
  return { points, slots, cores }
}
