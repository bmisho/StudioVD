import { z } from "zod"
import { builtin, mm, segmentsFor } from "../../common"
import { BodyBuilder } from "../../mesh/builder"
import { revolve } from "../../mesh/revolve"
import { defineGenerator } from "../../types"
import { uprightAnchors } from "../anchors"

const Params = z
  .object({
    diameterMm: z.number().min(0.1).max(10_000),
    heightMm: z.number().min(0.1).max(10_000),
  })
  .strict()

/** An upright cylinder on the Y axis, centred on its origin. */
export const primitiveCylinder = defineGenerator({
  id: "primitive.cylinder",
  major: 1,
  version: "1.0.0",
  name: "Cylinder",
  summary: "A round solid cylinder",
  category: ["primitives"],
  tags: ["cylinder", "rod", "disc"],
  params: Params,
  defaults: { diameterMm: 20, heightMm: 20 },
  presets: [{ key: "disc", name: "Disc Ø40 × 5", params: { diameterMm: 40, heightMm: 5 } }],
  sources: [],
  generate: ({ diameterMm: d, heightMm: h }) => {
    const [r, y0, y1] = [d / 2, -h / 2, h / 2]
    const b = new BodyBuilder()
    const profile = [
      [[0, y0] as const, [r, y0] as const],
      [[r, y0] as const, [r, y1] as const],
      [[r, y1] as const, [0, y1] as const],
    ]
    revolve(b, profile, segmentsFor(r))
    return {
      name: `Cylinder Ø${mm(d)} × ${mm(h)}`,
      bodies: {
        cylinder: {
          name: "Cylinder",
          mesh: b.build(),
          material: "body",
          collider: "hull",
          volumeMm3: Math.PI * r * r * h,
        },
      },
      rootBody: "cylinder",
      materials: { body: builtin("std.abs") },
      anchors: uprightAnchors("cylinder", y0, y1),
      mates: {},
      suggestedMates: [],
      placement: { anchor: "bottom", groundIfFirst: true },
    }
  },
})
