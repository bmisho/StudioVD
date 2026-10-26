import { z } from "zod"
import { builtin, segmentsFor } from "../../common"
import { BodyBuilder } from "../../mesh/builder"
import { circle, hexagon } from "../../mesh/outline"
import { extrude } from "../../mesh/prism"
import { defineGenerator, type GeneratedAnchor } from "../../types"
import { METRIC_SIZES, METRIC_SOURCES, MetricSizeSchema, metric } from "../metric"
import { hexArea } from "../socket"

const Params = z.object({ size: MetricSizeSchema }).strict()

/** An ISO 4032 hex nut lying flat (axis Y), its bore at the nominal diameter, unchamfered. */
export const fastenerNut = defineGenerator({
  id: "fastener.nut",
  major: 1,
  version: "1.0.0",
  name: "Hex nut",
  summary: "Metric hex nut, style 1 (ISO 4032)",
  category: ["mechanical", "fasteners"],
  tags: ["nut", "hex nut", "fastener", "metric"],
  designatorPrefix: "H",
  params: Params,
  defaults: { size: "M3" },
  presets: METRIC_SIZES.map((size) => ({
    key: size.replace(".", "_"),
    name: `${size} nut`,
    params: { size },
  })),
  sources: METRIC_SOURCES,
  generate: ({ size }) => {
    const { d, nut } = metric(size)
    const b = new BodyBuilder()
    extrude(b, hexagon(nut.s), [circle(d / 2, segmentsFor(nut.s / 2))], 0, nut.m)
    const face = (name: string, y: number, up: boolean): GeneratedAnchor => ({
      body: "nut",
      name,
      kind: "axial",
      frame: { originMm: [0, y, 0], z: [0, up ? 1 : -1, 0], x: [1, 0, 0] },
      interface: `${size}-nut`,
      role: "mate",
    })
    return {
      name: `Hex nut ${size} (ISO 4032)`,
      tags: [size.toLowerCase()],
      bodies: {
        nut: {
          name: `Nut ${size}`,
          mesh: b.build(),
          material: "steel",
          collider: "decomposed",
          role: "fastener",
          volumeMm3: (hexArea(nut.s) - (Math.PI * d * d) / 4) * nut.m,
        },
      },
      rootBody: "nut",
      materials: { steel: builtin("std.steel") },
      anchors: { bottom: face("Bottom face", 0, false), top: face("Top face", nut.m, true) },
      mates: {},
      suggestedMates: [
        { anchor: "bottom", mateType: "fixed", flip: true, label: `On an ${size} screw` },
      ],
      placement: { anchor: "bottom", groundIfFirst: false },
    }
  },
})
