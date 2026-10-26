import { z } from "zod"
import { builtin, mm, segmentsFor } from "../../common"
import { toRuns } from "../../fastener/screw/heads"
import { BodyBuilder } from "../../mesh/builder"
import type { Vec2 } from "../../mesh/outline"
import { revolve } from "../../mesh/revolve"
import { defineGenerator } from "../../types"
import { barAnchors } from "../ends"

const Params = z
  .object({
    outerMm: z.number().min(1).max(1000),
    innerMm: z.number().min(0.2).max(999),
    lengthMm: z.number().min(0.5).max(5000),
    material: z.enum(["steel", "aluminium", "brass", "copper", "acrylic"]),
  })
  .strict()
  .refine((p) => p.innerMm < p.outerMm - 0.2, { message: "wall too thin", path: ["innerMm"] })

const MATERIALS = {
  steel: "std.steel",
  aluminium: "std.aluminium-6061",
  brass: "std.brass",
  copper: "std.copper",
  acrylic: "std.pmma",
} as const

/** A round tube (or spacer) on the Y axis. */
export const stockTube = defineGenerator({
  id: "stock.tube",
  major: 1,
  version: "1.0.0",
  name: "Tube",
  summary: "Round tube, sleeve or spacer",
  category: ["mechanical", "stock"],
  tags: ["tube", "pipe", "sleeve", "spacer", "bushing"],
  params: Params,
  defaults: { outerMm: 10, innerMm: 8, lengthMm: 100, material: "aluminium" },
  presets: [
    {
      key: "spacer",
      name: "Spacer Ø8/Ø5 × 5",
      params: { outerMm: 8, innerMm: 5, lengthMm: 5, material: "aluminium" },
    },
    {
      key: "copper15",
      name: "Copper pipe 15 × 1",
      params: { outerMm: 15, innerMm: 13, lengthMm: 200, material: "copper" },
    },
  ],
  sources: [],
  generate: ({ outerMm: D, innerMm: d, lengthMm: length, material }) => {
    const [ri, ro] = [d / 2, D / 2]
    const ring: Vec2[] = [
      [ri, 0],
      [ro, 0],
      [ro, length],
      [ri, length],
      [ri, 0],
    ]
    const b = new BodyBuilder()
    revolve(b, toRuns(ring), segmentsFor(ro))
    const outside = barAnchors("tube", length, `shaft-${mm(D)}mm`)
    const inside = barAnchors("tube", length, `bore-${mm(d)}mm`)
    return {
      name: `Tube Ø${mm(D)}/Ø${mm(d)} × ${mm(length)}`,
      bodies: {
        tube: {
          name: "Tube",
          mesh: b.build(),
          material: "wall",
          collider: "decomposed",
          volumeMm3: Math.PI * (ro * ro - ri * ri) * length,
        },
      },
      rootBody: "tube",
      materials: { wall: builtin(MATERIALS[material]) },
      anchors: {
        ...outside,
        boreStart: { ...inside.start, name: "Bore start" },
        boreEnd: { ...inside.end, name: "Bore end" },
      },
      mates: {},
      suggestedMates: [],
      placement: { anchor: "start", groundIfFirst: false },
    }
  },
})
