import { z } from "zod"
import { builtin, estimated, mm, segmentsFor } from "../../common"
import { BodyBuilder } from "../../mesh/builder"
import { circle, hexagon, type Vec2 } from "../../mesh/outline"
import { cap } from "../../mesh/planar"
import { extrude, wall } from "../../mesh/prism"
import { revolve, revolvedVolume } from "../../mesh/revolve"
import { defineGenerator, type GeneratedAnchor } from "../../types"
import { metric } from "../metric"
import { toRuns } from "../screw/heads"
import { hexArea } from "../socket"

/** Hex width across flats of common brass standoffs (vendors vary by ±0.5 mm). */
const HEX = { M2: 4, "M2.5": 5, M3: 5.5, M4: 7 } as const

const Params = z
  .object({
    size: z.enum(["M2", "M2.5", "M3", "M4"]),
    lengthMm: z.number().min(3).max(100),
    /** Female both ends, or a male stud below and a female thread on top. */
    kind: z.enum(["FF", "MF"]),
    studMm: z.number().min(2).max(20),
  })
  .strict()

/** A hex spacer standing on its axis (Y): through-threaded, or with a stud below. */
export const fastenerStandoff = defineGenerator({
  id: "fastener.standoff",
  major: 1,
  version: "1.0.0",
  name: "Hex standoff",
  summary: "Hex spacer, female-female or male-female",
  category: ["mechanical", "fasteners"],
  tags: ["standoff", "spacer", "pcb", "fastener"],
  designatorPrefix: "H",
  params: Params,
  defaults: { size: "M3", lengthMm: 10, kind: "MF", studMm: 6 },
  presets: [
    {
      key: "m3ff10",
      name: "M3 × 10 female-female",
      params: { size: "M3", lengthMm: 10, kind: "FF", studMm: 6 },
    },
    {
      key: "m3mf10",
      name: "M3 × 10 + 6 male-female",
      params: { size: "M3", lengthMm: 10, kind: "MF", studMm: 6 },
    },
    {
      key: "m25mf6",
      name: "M2.5 × 6 + 5 male-female",
      params: { size: "M2.5", lengthMm: 6, kind: "MF", studMm: 5 },
    },
  ],
  sources: [
    {
      what: "Hex sizes",
      source: estimated("Typical brass standoff catalogues; vendors differ", "low"),
    },
  ],
  generate: ({ size, lengthMm: length, kind, studMm }) => {
    const { d, pitch } = metric(size)
    const s = HEX[size]
    const r = d / 2
    const n = segmentsFor(s / 2)
    const hex = hexagon(s)
    const hole = circle(r, n)
    const b = new BodyBuilder()
    let volume: number
    if (kind === "FF") {
      extrude(b, hex, [hole], 0, length)
      volume = (hexArea(s) - Math.PI * r * r) * length
    } else {
      const c = Math.min(pitch, studMm / 4)
      const stud: Vec2[] = [
        [0, -studMm],
        [r - c, -studMm],
        [r, -studMm + c],
        [r, 0],
      ]
      const depth = Math.min(length - 0.8, 2.5 * d)
      revolve(b, toRuns(stud), n)
      cap(b, 0, hex, [hole], false)
      wall(b, hex, 0, hex, length, true)
      cap(b, length, hex, [hole], true)
      wall(b, hole, length - depth, hole, length, false)
      cap(b, length - depth, hole, [], true)
      volume = revolvedVolume([...stud, [0, 0]]) + hexArea(s) * length - Math.PI * r * r * depth
    }
    const end = (name: string, y: number, up: boolean, tag: string): GeneratedAnchor => ({
      body: "standoff",
      name,
      kind: "axial",
      frame: { originMm: [0, y, 0], z: [0, up ? 1 : -1, 0], x: [1, 0, 0] },
      interface: tag,
      role: "mate",
    })
    return {
      name: `Standoff ${size} × ${mm(length)} ${kind === "MF" ? `+ ${mm(studMm)} ` : ""}${kind}`,
      tags: [size.toLowerCase(), kind.toLowerCase()],
      bodies: {
        standoff: {
          name: `Standoff ${size} × ${mm(length)}`,
          mesh: b.build(),
          material: "brass",
          collider: kind === "FF" ? "decomposed" : "hull",
          role: "fastener",
          volumeMm3: volume,
        },
      },
      rootBody: "standoff",
      materials: { brass: builtin("std.brass") },
      anchors: {
        bottom:
          kind === "FF"
            ? end("Bottom", 0, false, `${size}-hole`)
            : end("Stud seat", 0, false, `${size}-screw`),
        top: end("Top", length, true, `${size}-hole`),
      },
      mates: {},
      suggestedMates: [],
      placement: { anchor: "bottom", groundIfFirst: false },
    }
  },
})
