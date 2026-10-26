import { z } from "zod"
import { builtin, mm } from "../../common"
import { BodyBuilder } from "../../mesh/builder"
import { pathLength, tube } from "../../mesh/sweep"
import { uprightAnchors } from "../../primitive/anchors"
import { defineGenerator } from "../../types"
import { compressionPath, tightPitch } from "../helix"
import { SPRING_SOURCES, SPRING_WIRE, rateValue } from "../rate"

const Params = z
  .object({
    wireMm: z.number().min(0.2).max(10),
    outerDiameterMm: z.number().min(1).max(200),
    freeLengthMm: z.number().min(1).max(1000),
    activeCoils: z.number().min(1).max(60),
    closedEnds: z.boolean(),
    wire: z.enum(["music", "stainless"]),
  })
  .strict()
  .refine((p) => p.outerDiameterMm >= 3 * p.wireMm, {
    message: "coil too tight for the wire",
    path: ["outerDiameterMm"],
  })
  .refine(
    (p) =>
      p.freeLengthMm - p.wireMm >
      1.2 * tightPitch(p.wireMm) * (p.activeCoils + (p.closedEnds ? 2 : 0)),
    { message: "too short: the coils would touch", path: ["freeLengthMm"] }
  )

/** A helical compression spring standing on the XZ plane (axis Y). */
export const springCompression = defineGenerator({
  id: "spring.compression",
  major: 1,
  version: "1.0.0",
  name: "Compression spring",
  summary: "Helical compression spring, closed or open ends",
  category: ["mechanical", "springs"],
  tags: ["spring", "compression spring", "coil"],
  designatorPrefix: "SP",
  params: Params,
  defaults: {
    wireMm: 1,
    outerDiameterMm: 10,
    freeLengthMm: 30,
    activeCoils: 8,
    closedEnds: true,
    wire: "music",
  },
  presets: [
    {
      key: "small",
      name: "Ø6 × 15, wire 0.5",
      params: {
        wireMm: 0.5,
        outerDiameterMm: 6,
        freeLengthMm: 15,
        activeCoils: 8,
        closedEnds: true,
        wire: "music",
      },
    },
    {
      key: "medium",
      name: "Ø10 × 30, wire 1",
      params: {
        wireMm: 1,
        outerDiameterMm: 10,
        freeLengthMm: 30,
        activeCoils: 8,
        closedEnds: true,
        wire: "music",
      },
    },
    {
      key: "open",
      name: "Ø20 × 50, wire 2, open ends",
      params: {
        wireMm: 2,
        outerDiameterMm: 20,
        freeLengthMm: 50,
        activeCoils: 6,
        closedEnds: false,
        wire: "stainless",
      },
    },
  ],
  sources: SPRING_SOURCES,
  generate: ({
    wireMm: d,
    outerDiameterMm: OD,
    freeLengthMm: L0,
    activeCoils: n,
    closedEnds,
    wire,
  }) => {
    const D = OD - d
    const path = compressionPath(D / 2, d, L0, n, closedEnds ? 1 : 0, 24)
    const b = new BodyBuilder()
    tube(b, path, d / 2, 12)
    return {
      name: `Compression spring Ø${mm(OD)} × ${mm(L0)}, wire ${mm(d)}`,
      bodies: {
        spring: {
          name: "Spring",
          mesh: b.build(),
          material: "wire",
          collider: "hull",
          volumeMm3: Math.PI * (d / 2) ** 2 * pathLength(path),
        },
      },
      rootBody: "spring",
      materials: { wire: builtin(SPRING_WIRE[wire].key) },
      anchors: uprightAnchors("spring", 0, L0),
      mates: {},
      suggestedMates: [],
      placement: { anchor: "bottom", groundIfFirst: false },
      values: { rate: rateValue(wire, d, D, n) },
    }
  },
})
