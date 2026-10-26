import { z } from "zod"
import { builtin, estimated, frameAt } from "../../common"
import { BLACK_PBT } from "../../materials"
import { BodyBuilder } from "../../mesh/builder"
import { at, rectangle, shifted } from "../../mesh/outline"
import { cap } from "../../mesh/planar"
import { extrude, wall } from "../../mesh/prism"
import { defineGenerator, type GeneratedAnchor } from "../../types"
import { pinPiece } from "./pins"

const PITCH = 2.54
/** Header: 2.5 mm insulator, 6 mm mating pins above, 3 mm tails; socket: 8.5 mm body. */
const DIMS = { header: 2.5, socket: 8.5, mating: 6, tail: 3, opening: 1, depth: 6 } as const

const Params = z
  .object({
    kind: z.enum(["header", "socket"]),
    rows: z.union([z.literal(1), z.literal(2)]),
    pinsPerRow: z.number().int().min(1).max(40),
  })
  .strict()

/** A 2.54 mm pin header or socket strip on a board (y = 0 is the board face). */
export const connectorPinHeader = defineGenerator({
  id: "connector.pinHeader",
  major: 1,
  version: "1.0.0",
  name: "Pin header",
  summary: "2.54 mm pin header or socket, one or two rows",
  category: ["electrical", "connectors"],
  tags: ["pin header", "socket", "dupont", "2.54mm", "connector"],
  designatorPrefix: "J",
  params: Params,
  defaults: { kind: "header", rows: 1, pinsPerRow: 8 },
  presets: [
    { key: "h1x4", name: "Header 1×4", params: { kind: "header", rows: 1, pinsPerRow: 4 } },
    { key: "h1x8", name: "Header 1×8", params: { kind: "header", rows: 1, pinsPerRow: 8 } },
    { key: "h2x20", name: "Header 2×20", params: { kind: "header", rows: 2, pinsPerRow: 20 } },
    { key: "s1x8", name: "Socket 1×8", params: { kind: "socket", rows: 1, pinsPerRow: 8 } },
    { key: "s2x10", name: "Socket 2×10", params: { kind: "socket", rows: 2, pinsPerRow: 10 } },
  ],
  sources: [
    {
      what: "Dimensions",
      source: estimated(
        "Common 2.54 mm headers: 2.5 mm insulator, 0.64 mm square pins, 6.0 mm mating length, 3.0 mm tails; sockets 8.5 mm high",
        "medium"
      ),
    },
    {
      what: "Insulator density",
      source: estimated(
        "Unfilled PBT 1.31 g/cm³ (ISO 1183 grade data); real headers are often glass-filled",
        "medium"
      ),
    },
  ],
  generate: ({ kind, rows, pinsPerRow: n }) => {
    const height = DIMS[kind]
    const pins = Array.from({ length: n * rows }, (_, i) => {
      const [col, row] = [Math.floor(i / rows), i % rows]
      return { number: i + 1, u: (col - (n - 1) / 2) * PITCH, v: ((rows - 1) / 2 - row) * PITCH }
    })
    const [W, D] = [n * PITCH, rows * PITCH]
    const b = new BodyBuilder()
    let volume = W * D * height
    if (kind === "header") extrude(b, rectangle(W, D), [], 0, height)
    else {
      const openings = pins.map((p) => shifted(rectangle(DIMS.opening, DIMS.opening), p.u, p.v))
      const outer = rectangle(W, D)
      wall(b, outer, 0, outer, height, true)
      cap(b, 0, outer, [], false)
      cap(b, height, outer, openings, true)
      for (const o of openings) {
        wall(b, o, height - DIMS.depth, o, height, false)
        cap(b, height - DIMS.depth, o, [], true)
      }
      volume -= pins.length * DIMS.opening ** 2 * DIMS.depth
    }
    for (const p of pins) {
      volume += pinPiece(b, p.u, p.v, -DIMS.tail, 0, false, 1)
      if (kind === "header") volume += pinPiece(b, p.u, p.v, height, height + DIMS.mating, true, 1)
    }
    const anchors: Record<string, GeneratedAnchor> = {
      board: {
        body: "strip",
        name: "Board face",
        kind: "planar",
        frame: frameAt([0, 0, 0], [0, -1, 0], [1, 0, 0]),
        role: "placement",
      },
    }
    for (const p of pins)
      anchors[`pin${p.number}`] = {
        body: "strip",
        name: `Pin ${p.number}`,
        kind: "axial",
        frame: frameAt(at([p.u, p.v], height), [0, 1, 0], [1, 0, 0]),
        interface: kind === "header" ? "pin-2.54mm" : "socket-2.54mm",
        role: "port",
      }
    const label = `${rows}×${n}`
    return {
      name: `${kind === "header" ? "Pin header" : "Socket"} ${label}, 2.54 mm`,
      tags: [label.replace("×", "x"), kind],
      bodies: {
        strip: {
          name: kind === "header" ? "Header" : "Socket",
          mesh: b.build(),
          material: "body",
          slots: [
            { name: "Housing", material: "body" },
            { name: "Pins", material: "pins" },
          ],
          collider: "box",
          role: "body",
          volumeMm3: volume,
        },
      },
      rootBody: "strip",
      materials: { body: BLACK_PBT(), pins: builtin("std.brass") },
      anchors,
      mates: {},
      suggestedMates: [],
      placement: { anchor: "board", groundIfFirst: false },
    }
  },
})
