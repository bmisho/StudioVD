import type { BlockDef, Port } from "@/core/schema"

// Where a block's ports sit (PLAN 11.1): computed from its definition alone, on the 16 px grid,
// so the canvas, the minimap and the SVG export agree without measuring anything.

export const GRID = 16
const HEADER = 3 * GRID // label and block name
const SYMBOL_ROWS = 2
const MIN_WIDTH = 10 * GRID

export type Side = "left" | "right" | "top" | "bottom"

/** The built-in symbol's top-left corner: the header's right end, clear of every port label. */
export const symbolAt = (width: number) => ({ x: width - 48, y: 12 })

/**
 * Where a port's name goes, from the port and the block's width: beside side ports inside the
 * block, outside it above top ports and below bottom ones (the header and symbol stay clear).
 */
export function labelAt(spot: { x: number; y: number; side: Side }, width: number) {
  switch (spot.side) {
    case "left":
      return { x: spot.x + 10, y: spot.y + 4, anchor: "start" as const }
    case "right":
      return { x: width - 10, y: spot.y + 4, anchor: "end" as const }
    case "top":
      return { x: spot.x, y: spot.y - 9, anchor: "middle" as const }
    case "bottom":
      return { x: spot.x, y: spot.y + 19, anchor: "middle" as const }
  }
}

export interface PortSpot {
  port: Port
  side: Side
  /** From the block's top-left corner, on its outline. */
  x: number
  y: number
}

export interface BlockLayout {
  width: number
  height: number
  ports: PortSpot[]
}

/** The side a port sits on: its own, else outputs right and everything else left. */
export const sideOf = (p: Port): Side => p.side ?? (p.direction === "out" ? "right" : "left")

export function blockLayout(def: Pick<BlockDef, "ports">): BlockLayout {
  const by: Record<Side, Port[]> = { left: [], right: [], top: [], bottom: [] }
  for (const p of def.ports) by[sideOf(p)].push(p)
  const rows = Math.max(by.left.length, by.right.length, SYMBOL_ROWS)
  const columns = Math.max(by.top.length, by.bottom.length)
  const width = Math.max(MIN_WIDTH, (columns + 1) * GRID * 2)
  const height = HEADER + (rows + 1) * GRID
  const spots: PortSpot[] = []
  by.left.forEach((port, i) => spots.push({ port, side: "left", x: 0, y: HEADER + (i + 1) * GRID }))
  by.right.forEach((port, i) =>
    spots.push({ port, side: "right", x: width, y: HEADER + (i + 1) * GRID })
  )
  const across = (list: Port[], side: Side, y: number) => {
    const pitch = width / (list.length + 1)
    list.forEach((port, i) =>
      spots.push({ port, side, x: Math.round(((i + 1) * pitch) / GRID) * GRID, y })
    )
  }
  across(by.top, "top", 0)
  across(by.bottom, "bottom", height)
  return { width, height, ports: spots }
}
