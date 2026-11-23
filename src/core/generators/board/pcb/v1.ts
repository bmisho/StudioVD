import { z } from "zod"
import { builtin, estimated, frameAt, mm, standard } from "../../common"
import { axialY } from "../../control/parts"
import { BodyBuilder } from "../../mesh/builder"
import { at, circleAt, outlineArea, rectangle, roundedRect } from "../../mesh/outline"
import { extrude } from "../../mesh/prism"
import { defineGenerator, type GeneratedAnchor } from "../../types"

const PAD = { side: 2, height: 0.05 } as const

const Params = z
  .object({
    widthMm: z.number().min(5).max(500),
    depthMm: z.number().min(5).max(500),
    thicknessMm: z.number().min(0.4).max(3.2),
    holes: z.boolean(),
    holeDiameterMm: z.number().min(1).max(10),
    holeInsetMm: z.number().min(1).max(30),
    pads: z.number().int().min(0).max(24),
    padPitchMm: z.number().min(2.54).max(10),
  })
  .strict()
  .refine(
    (p) => !p.holes || p.holeInsetMm * 2 + p.holeDiameterMm < Math.min(p.widthMm, p.depthMm),
    "the holes must fit the board"
  )
  .refine(
    (p) =>
      p.pads === 0 ||
      p.pads * p.padPitchMm < p.widthMm - (p.holes ? 2 * p.holeInsetMm + p.holeDiameterMm : 0),
    "the pads must fit along the front edge"
  )

const DEFAULTS = {
  widthMm: 60,
  depthMm: 40,
  thicknessMm: 1.6,
  holes: true,
  holeDiameterMm: 3.2,
  holeInsetMm: 3.5,
  pads: 8,
  padPitchMm: 3.81,
}

/**
 * A plain circuit board (PLAN 16.4): FR-4 from y = 0 up, optional corner holes (M3
 * clearance by default) and a row of solder pads along the front edge whose anchors are
 * where off-board wires (cables) land.
 */
export const boardPcb = defineGenerator({
  id: "board.pcb",
  major: 1,
  version: "1.0.0",
  name: "Circuit board",
  summary: "Plain FR-4 board with corner holes and a row of wire pads",
  category: ["electrical", "boards"],
  tags: ["pcb", "board", "fr4", "perfboard", "pedal"],
  designatorPrefix: "PCB",
  params: Params,
  defaults: DEFAULTS,
  presets: [
    { key: "small", name: "Board 60 × 40 mm", params: DEFAULTS },
    {
      key: "large",
      name: "Board 100 × 80 mm",
      params: { ...DEFAULTS, widthMm: 100, depthMm: 80, pads: 12 },
    },
  ],
  sources: [
    {
      what: "Board thickness",
      source: standard("1.6 mm is the common FR-4 board thickness (IPC-4101 laminates)", "medium"),
    },
    {
      what: "Hole size",
      source: standard("ISO 273 fine-series clearance hole for M3: Ø3.2 mm", "medium"),
    },
    {
      what: "Pads",
      source: estimated(
        "Visual default: 2 mm square pads every 3.81 mm (0.15 in) for off-board wires",
        "low"
      ),
    },
  ],
  generate: (p) => {
    const [W, D, t] = [p.widthMm, p.depthMm, p.thicknessMm]
    const outer = roundedRect(W, D, 1, 3)
    const [hu, hv] = [W / 2 - p.holeInsetMm, D / 2 - p.holeInsetMm]
    const corners: [number, number][] = p.holes
      ? [
          [hu, hv],
          [-hu, hv],
          [-hu, -hv],
          [hu, -hv],
        ]
      : []
    const holes = corners.map((c) => circleAt(c, p.holeDiameterMm / 2, 16))
    const b = new BodyBuilder()
    extrude(b, outer, holes, 0, t)
    let volume = (outlineArea(outer) - holes.reduce((s, h) => s + outlineArea(h), 0)) * t
    const anchors: Record<string, GeneratedAnchor> = {
      top: axialY("board", "Top face", t, true, { kind: "planar", role: "placement" }),
      bottom: axialY("board", "Bottom face", 0, false, { kind: "planar", role: "mount" }),
    }
    corners.forEach(([u, v], i) => {
      anchors[`hole${i + 1}`] = {
        body: "board",
        name: `Hole ${i + 1}`,
        kind: "axial",
        frame: frameAt(at([u, v], t), [0, 1, 0], [1, 0, 0]),
        interface: p.holeDiameterMm === 3.2 ? "M3-hole" : `hole-${mm(p.holeDiameterMm)}mm`,
        role: "mount",
      }
    })
    // Pads along the front edge (+v is world −Z: the side facing the viewer by default).
    const vPad = D / 2 - 2.5
    for (let i = 0; i < p.pads; i++) {
      const u = (i - (p.pads - 1) / 2) * p.padPitchMm
      extrude(b, rectangle(PAD.side, PAD.side, u, vPad), [], t - 0.01, t + PAD.height, 1)
      volume += PAD.side * PAD.side * (PAD.height + 0.01)
      anchors[`pad${i + 1}`] = {
        body: "board",
        name: `Pad ${i + 1}`,
        kind: "point",
        frame: frameAt(at([u, vPad], t + PAD.height), [0, 1, 0], [1, 0, 0]),
        role: "port",
      }
    }
    return {
      name: `Circuit board ${mm(W)} × ${mm(D)} mm`,
      tags: [`${mm(W)}x${mm(D)}`],
      bodies: {
        board: {
          name: "Board",
          mesh: b.build(),
          material: "fr4",
          ...(p.pads > 0 && {
            slots: [
              { name: "Board", material: "fr4" },
              { name: "Pads", material: "copper" },
            ],
          }),
          collider: "box",
          role: "body",
          volumeMm3: volume,
        },
      },
      rootBody: "board",
      materials: { fr4: builtin("std.fr4"), copper: builtin("std.copper") },
      anchors,
      mates: {},
      suggestedMates: [],
      placement: { anchor: "bottom", groundIfFirst: false },
    }
  },
})
