import type { Domain, SceneDocument } from "@/core/schema"
import { DOMAIN_LOOK } from "./domainLook"
import { blockLayout, GRID, labelAt, symbolAt, type PortSpot, type Side } from "./layout"
import { symbolPath } from "./symbols"
import { wirePoints } from "./wireRoute"

// The schematic as a standalone SVG file (PLAN 11.8): the same layout, symbols, port shapes
// and line patterns as the canvas, in resolved colours (an exported file has no theme).

export interface SchematicPalette {
  background: string
  foreground: string
  muted: string
  border: string
  domains: Readonly<Record<Domain, string>>
  font: string
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const n = (v: number) => String(Math.round(v * 100) / 100)
const PORT = 12

function portMark(spot: PortSpot, x: number, y: number, p: SchematicPalette): string {
  const look = DOMAIN_LOOK[spot.port.domain]
  const color = p.domains[spot.port.domain]
  const hollow = spot.port.direction === "in"
  const paint = hollow
    ? `fill="${p.background}" stroke="${color}" stroke-width="2.5"`
    : `fill="${color}"`
  const [cx, cy] = [x + spot.x, y + spot.y]
  if (look.port === "circle")
    return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${PORT / 2}" ${paint}/>`
  const points = look.port
    .map(([u, v]) => `${n(cx - PORT / 2 + u * PORT)},${n(cy - PORT / 2 + v * PORT)}`)
    .join(" ")
  return `<polygon points="${points}" ${paint}/>`
}

/** The schematic as SVG text, or null when it has no blocks. */
export function schematicSvg(
  doc: Pick<SceneDocument, "schematic" | "components">,
  p: SchematicPalette
): string | null {
  const { nodes, edges, blockDefs } = doc.schematic
  const blocks: string[] = []
  const spots = new Map<string, { x: number; y: number; side: Side; top: number }>()
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const node of Object.values(nodes)) {
    const def = blockDefs[node.blockDefId]
    if (!def) continue
    const { width: w, height: h, ports } = blockLayout(def)
    const { x, y } = node.position
    ;[minX, minY, maxX, maxY] = [
      Math.min(minX, x),
      Math.min(minY, y),
      Math.max(maxX, x + w),
      Math.max(maxY, y + h),
    ]
    const c = node.componentInstanceId
    const designator = c !== undefined ? doc.components[c]?.designator : undefined
    const symbol = symbolAt(w)
    const parts = [
      `<rect x="${n(x)}" y="${n(y)}" width="${w}" height="${h}" rx="6" fill="${p.background}" stroke="${p.border}"/>`,
      `<text x="${n(x + 8)}" y="${n(y + 17)}" font-size="12" font-weight="500" fill="${p.foreground}">${esc(node.label)}${designator ? ` <tspan fill="${p.muted}">${esc(designator)}</tspan>` : ""}</text>`,
      `<text x="${n(x + 8)}" y="${n(y + 33)}" font-size="12" fill="${p.muted}">${esc(def.name)}</text>`,
      `<path transform="translate(${n(x + symbol.x)} ${n(y + symbol.y)})" d="${symbolPath(def.symbol)}" fill="none" stroke="${p.foreground}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    ]
    for (const spot of ports) {
      const label = labelAt(spot, w)
      parts.push(
        `<text x="${n(x + label.x)}" y="${n(y + label.y)}" font-size="12" text-anchor="${label.anchor}" fill="${p.muted}">${esc(spot.port.name)}</text>`,
        portMark(spot, x, y, p)
      )
      spots.set(`${node.id}/${spot.port.key}`, {
        x: x + spot.x,
        y: y + spot.y,
        side: spot.side,
        top: y,
      })
    }
    blocks.push(`<g>${parts.join("")}</g>`)
  }
  if (blocks.length === 0) return null
  const wires: string[] = []
  for (const e of Object.values(edges)) {
    const a = spots.get(`${e.source}/${e.sourcePort}`)
    const b = spots.get(`${e.target}/${e.targetPort}`)
    const def = blockDefs[nodes[e.source]?.blockDefId ?? ("" as never)]
    const domain = def?.ports.find((q) => q.key === e.sourcePort)?.domain
    if (!a || !b || !domain) continue
    const look = DOMAIN_LOOK[domain]
    const points = wirePoints(a, b)
    for (const [px, py] of points)
      [minX, minY, maxX, maxY] = [
        Math.min(minX, px),
        Math.min(minY, py),
        Math.max(maxX, px),
        Math.max(maxY, py),
      ]
    wires.push(
      `<polyline points="${points.map(([px, py]) => `${n(px)},${n(py)}`).join(" ")}" fill="none" stroke="${p.domains[domain]}" stroke-width="${look.wireWidth}"${look.dash ? ` stroke-dasharray="${look.dash}" stroke-linecap="round"` : ""} stroke-linejoin="round"/>`
    )
  }
  const m = 2 * GRID
  const [vx, vy, vw, vh] = [minX - m, minY - m, maxX - minX + 2 * m, maxY - minY + 2 * m]
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(vx)} ${n(vy)} ${n(vw)} ${n(vh)}" width="${n(vw)}" height="${n(vh)}" font-family="${esc(p.font)}">`,
    `<rect x="${n(vx)}" y="${n(vy)}" width="${n(vw)}" height="${n(vh)}" fill="${p.background}"/>`,
    ...wires,
    ...blocks,
    `</svg>`,
  ].join("\n")
}
