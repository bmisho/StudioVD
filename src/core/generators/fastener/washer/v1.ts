import { z } from "zod"
import { builtin, segmentsFor } from "../../common"
import { BodyBuilder } from "../../mesh/builder"
import type { Vec2 } from "../../mesh/outline"
import { revolve } from "../../mesh/revolve"
import { defineGenerator, type GeneratedAnchor } from "../../types"
import { toRuns } from "../screw/heads"
import { METRIC_SIZES, METRIC_SOURCES, MetricSizeSchema, metric } from "../metric"

const Params = z.object({ size: MetricSizeSchema }).strict()

/** An ISO 7089 plain washer lying flat (axis Y). */
export const fastenerWasher = defineGenerator({
  id: "fastener.washer",
  major: 1,
  version: "1.0.0",
  name: "Plain washer",
  summary: "Metric plain washer, normal series (ISO 7089)",
  category: ["mechanical", "fasteners"],
  tags: ["washer", "fastener", "metric"],
  designatorPrefix: "H",
  params: Params,
  defaults: { size: "M3" },
  presets: METRIC_SIZES.map((size) => ({
    key: size.replace(".", "_"),
    name: `${size} washer`,
    params: { size },
  })),
  sources: METRIC_SOURCES,
  generate: ({ size }) => {
    const { d1, d2, h } = metric(size).washer
    const [ri, ro] = [d1 / 2, d2 / 2]
    const ring: Vec2[] = [
      [ri, 0],
      [ro, 0],
      [ro, h],
      [ri, h],
      [ri, 0],
    ]
    const b = new BodyBuilder()
    revolve(b, toRuns(ring), segmentsFor(ro))
    const face = (name: string, y: number, up: boolean): GeneratedAnchor => ({
      body: "washer",
      name,
      kind: "axial",
      frame: { originMm: [0, y, 0], z: [0, up ? 1 : -1, 0], x: [1, 0, 0] },
      interface: `${size}-hole`,
      role: "mate",
    })
    return {
      name: `Plain washer ${size} (ISO 7089)`,
      tags: [size.toLowerCase()],
      bodies: {
        washer: {
          name: `Washer ${size}`,
          mesh: b.build(),
          material: "steel",
          collider: "decomposed",
          role: "fastener",
          volumeMm3: Math.PI * (ro * ro - ri * ri) * h,
        },
      },
      rootBody: "washer",
      materials: { steel: builtin("std.steel") },
      anchors: { bottom: face("Bottom face", 0, false), top: face("Top face", h, true) },
      mates: {},
      suggestedMates: [],
      placement: { anchor: "bottom", groundIfFirst: false },
    }
  },
})
