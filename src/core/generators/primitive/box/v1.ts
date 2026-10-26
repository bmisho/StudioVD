import { z } from "zod"
import { builtin, computed, mm } from "../../common"
import { BodyBuilder } from "../../mesh/builder"
import { rectangle } from "../../mesh/outline"
import { extrude } from "../../mesh/prism"
import { defineGenerator } from "../../types"

const Params = z
  .object({
    widthMm: z.number().min(0.1).max(10_000),
    heightMm: z.number().min(0.1).max(10_000),
    depthMm: z.number().min(0.1).max(10_000),
  })
  .strict()

/** A block, centred on its origin: width along X, height along Y, depth along Z. */
export const primitiveBox = defineGenerator({
  id: "primitive.box",
  major: 1,
  version: "1.0.0",
  name: "Box",
  summary: "A rectangular block",
  category: ["primitives"],
  tags: ["box", "block", "cuboid"],
  params: Params,
  defaults: { widthMm: 20, heightMm: 20, depthMm: 20 },
  presets: [
    { key: "cube20", name: "Cube 20 mm", params: { widthMm: 20, heightMm: 20, depthMm: 20 } },
    {
      key: "plate",
      name: "Plate 100 × 5 × 60",
      params: { widthMm: 100, heightMm: 5, depthMm: 60 },
    },
  ],
  sources: [],
  generate: ({ widthMm: w, heightMm: h, depthMm: d }) => {
    const b = new BodyBuilder()
    extrude(b, rectangle(w, d), [], -h / 2, h / 2)
    return {
      name: `Box ${mm(w)} × ${mm(h)} × ${mm(d)}`,
      bodies: {
        box: {
          name: "Box",
          mesh: b.build(),
          material: "body",
          collider: "box",
          volumeMm3: w * h * d,
        },
      },
      rootBody: "box",
      materials: { body: builtin("std.abs") },
      anchors: {
        bottom: {
          body: "box",
          name: "Bottom",
          kind: "planar",
          frame: { originMm: [0, -h / 2, 0], z: [0, -1, 0], x: [1, 0, 0] },
          role: "placement",
        },
        top: {
          body: "box",
          name: "Top",
          kind: "planar",
          frame: { originMm: [0, h / 2, 0], z: [0, 1, 0], x: [1, 0, 0] },
          role: "mount",
        },
        centre: {
          body: "box",
          name: "Centre",
          kind: "point",
          frame: { originMm: [0, 0, 0], z: [0, 1, 0], x: [1, 0, 0] },
          role: "reference",
        },
      },
      mates: {},
      suggestedMates: [],
      placement: { anchor: "bottom", groundIfFirst: true },
      values: { volume: { value: w * h * d, unit: "mm³", source: computed("w × h × d") } },
    }
  },
})
