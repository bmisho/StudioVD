import type { SceneDocument } from "@/core/schema"
import { cableStatus } from "./cableMesh"
import { connectorFrames } from "./frames"

/** One cable as cut (PLAN 16.3). */
export interface CutRow {
  name: string
  colour: string
  diameterMm: number
  wires: 1 | 2
  lengthMm: number
  waypoints: number
  /** Millimetres it lacks for its route now (0 when it reaches). */
  shortMm: number
}

/** Every cable in the document, by name, with what it is cut from and to what length. */
export function cutList(
  doc: Pick<SceneDocument, "connectors" | "anchors" | "parts" | "materials">
): CutRow[] {
  const rows: CutRow[] = []
  for (const c of Object.values(doc.connectors)) {
    if (c.kind !== "cable") continue
    const frames = connectorFrames(doc, c)
    const status = frames ? cableStatus(c, frames) : null
    const material =
      c.materialId && Object.hasOwn(doc.materials, c.materialId)
        ? doc.materials[c.materialId]
        : undefined
    rows.push({
      name: c.name,
      colour: material?.name ?? "Default",
      diameterMm: c.outerMm,
      wires: c.conductors,
      lengthMm: c.lengthMm,
      waypoints: c.via.length,
      shortMm: Math.round((status?.shortMm ?? 0) * 10) / 10,
    })
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name) || a.lengthMm - b.lengthMm)
}

/**
 * A CSV cell (RFC 4180): quoted when it holds a comma, quote or line break; a text cell
 * starting with = + - @ (or a tab or carriage return) gets a leading apostrophe so a
 * spreadsheet shows it rather than running it as a formula (names are the user's text).
 */
function cell(value: string | number): string {
  let text = String(value)
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** The cut list as CSV text, CRLF line endings, a header row first. */
export function cutListCsv(rows: readonly CutRow[]): string {
  const header = ["Cable", "Colour", "Diameter (mm)", "Wires", "Length (mm)", "Waypoints", "Note"]
  const lines = rows.map((r) =>
    [
      r.name,
      r.colour,
      r.diameterMm,
      r.wires === 2 ? "twisted pair" : "1",
      r.lengthMm,
      r.waypoints,
      r.shortMm > 0 ? `too short by ${r.shortMm} mm` : "",
    ]
      .map(cell)
      .join(",")
  )
  return `${[header.map(cell).join(","), ...lines].join("\r\n")}\r\n`
}
