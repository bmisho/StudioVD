import { z } from "zod"
import { builtin, mm, segmentsFor } from "../../common"
import { BodyBuilder } from "../../mesh/builder"
import { arc, revolve } from "../../mesh/revolve"
import { defineGenerator } from "../../types"

const Params = z.object({ diameterMm: z.number().min(0.1).max(10_000) }).strict()

/** A ball centred on its origin. */
export const primitiveSphere = defineGenerator({
  id: "primitive.sphere",
  major: 1,
  version: "1.0.0",
  name: "Sphere",
  summary: "A solid ball",
  category: ["primitives"],
  tags: ["sphere", "ball"],
  params: Params,
  defaults: { diameterMm: 20 },
  presets: [{ key: "ball10", name: "Ball Ø10", params: { diameterMm: 10 } }],
  sources: [],
  generate: ({ diameterMm: d }) => {
    const r = d / 2
    const n = Math.max(48, segmentsFor(r)) // faceted both ways: finer than a cylinder
    const b = new BodyBuilder()
    revolve(b, [arc([0, 0], r, -Math.PI / 2, Math.PI / 2, n / 2)], n)
    return {
      name: `Sphere Ø${mm(d)}`,
      bodies: {
        sphere: {
          name: "Sphere",
          mesh: b.build(),
          material: "body",
          collider: "hull",
          volumeMm3: (4 / 3) * Math.PI * r ** 3,
        },
      },
      rootBody: "sphere",
      materials: { body: builtin("std.abs") },
      anchors: {
        centre: {
          body: "sphere",
          name: "Centre",
          kind: "point",
          frame: { originMm: [0, 0, 0], z: [0, 1, 0], x: [1, 0, 0] },
          role: "mate",
        },
      },
      mates: {},
      suggestedMates: [],
      placement: { groundIfFirst: true },
    }
  },
})
