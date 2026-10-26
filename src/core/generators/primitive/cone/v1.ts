import { z } from "zod"
import { builtin, mm, segmentsFor } from "../../common"
import { BodyBuilder } from "../../mesh/builder"
import type { Vec2 } from "../../mesh/outline"
import { revolve } from "../../mesh/revolve"
import { defineGenerator } from "../../types"
import { uprightAnchors } from "../anchors"

const Params = z
  .object({
    baseDiameterMm: z.number().min(0.1).max(10_000),
    /** 0 for a pointed cone. */
    topDiameterMm: z.number().min(0).max(10_000),
    heightMm: z.number().min(0.1).max(10_000),
  })
  .strict()

/** A cone or frustum standing on its base, centred on its origin. */
export const primitiveCone = defineGenerator({
  id: "primitive.cone",
  major: 1,
  version: "1.0.0",
  name: "Cone",
  summary: "A cone or a truncated cone",
  category: ["primitives"],
  tags: ["cone", "frustum"],
  params: Params,
  defaults: { baseDiameterMm: 20, topDiameterMm: 0, heightMm: 20 },
  presets: [
    {
      key: "frustum",
      name: "Frustum Ø30/Ø15 × 20",
      params: { baseDiameterMm: 30, topDiameterMm: 15, heightMm: 20 },
    },
  ],
  sources: [],
  generate: ({ baseDiameterMm: d0, topDiameterMm: d1, heightMm: h }) => {
    const [r0, r1, y0, y1] = [d0 / 2, d1 / 2, -h / 2, h / 2]
    const b = new BodyBuilder()
    const runs: Vec2[][] = [
      [
        [0, y0],
        [r0, y0],
      ],
      [
        [r0, y0],
        [r1, y1],
      ],
    ]
    if (r1 > 0)
      runs.push([
        [r1, y1],
        [0, y1],
      ])
    revolve(b, runs, segmentsFor(Math.max(r0, r1)))
    const volume = (Math.PI * h * (r0 * r0 + r0 * r1 + r1 * r1)) / 3
    return {
      name: r1 > 0 ? `Frustum Ø${mm(d0)}/Ø${mm(d1)} × ${mm(h)}` : `Cone Ø${mm(d0)} × ${mm(h)}`,
      bodies: {
        cone: {
          name: "Cone",
          mesh: b.build(),
          material: "body",
          collider: "hull",
          volumeMm3: volume,
        },
      },
      rootBody: "cone",
      materials: { body: builtin("std.abs") },
      anchors: uprightAnchors("cone", y0, y1, r1 > 0),
      mates: {},
      suggestedMates: [],
      placement: { anchor: "bottom", groundIfFirst: true },
    }
  },
})
