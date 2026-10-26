import { z } from "zod"
import { builtin, frameAt, mm } from "../../common"
import { BodyBuilder } from "../../mesh/builder"
import { pathLength, tube } from "../../mesh/sweep"
import { defineGenerator } from "../../types"
import { extensionPath } from "../helix"
import { SPRING_SOURCES, SPRING_WIRE, rateValue } from "../rate"

const Params = z
  .object({
    wireMm: z.number().min(0.2).max(8),
    outerDiameterMm: z.number().min(2).max(150),
    coils: z.number().min(2).max(100),
    wire: z.enum(["music", "stainless"]),
  })
  .strict()
  .refine((p) => p.outerDiameterMm >= 4 * p.wireMm, {
    message: "coil too tight for the wire",
    path: ["outerDiameterMm"],
  })

/** A close-wound extension spring with a machine loop at each end (axis Y). */
export const springExtension = defineGenerator({
  id: "spring.extension",
  major: 1,
  version: "1.0.0",
  name: "Extension spring",
  summary: "Close-wound extension spring with a loop at each end",
  category: ["mechanical", "springs"],
  tags: ["spring", "extension spring", "tension spring"],
  designatorPrefix: "SP",
  params: Params,
  defaults: { wireMm: 0.8, outerDiameterMm: 8, coils: 20, wire: "music" },
  presets: [
    {
      key: "small",
      name: "Ø6, wire 0.6, 15 coils",
      params: { wireMm: 0.6, outerDiameterMm: 6, coils: 15, wire: "music" },
    },
    {
      key: "large",
      name: "Ø16, wire 1.5, 25 coils",
      params: { wireMm: 1.5, outerDiameterMm: 16, coils: 25, wire: "stainless" },
    },
  ],
  sources: SPRING_SOURCES,
  generate: ({ wireMm: d, outerDiameterMm: OD, coils, wire }) => {
    const D = OD - d
    const { path, hooks } = extensionPath(D / 2, d, coils, 24)
    const b = new BodyBuilder()
    tube(b, path, d / 2, 12)
    const hook = (name: string, h: (typeof hooks)["top"]) => ({
      body: "spring",
      name,
      kind: "axial" as const,
      frame: frameAt(h.centre, h.normal, h.up),
      role: "mount" as const,
    })
    return {
      name: `Extension spring Ø${mm(OD)}, wire ${mm(d)}, ${mm(coils)} coils`,
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
      anchors: { top: hook("Top loop", hooks.top), bottom: hook("Bottom loop", hooks.bottom) },
      mates: {},
      suggestedMates: [],
      placement: { groundIfFirst: false },
      values: { rate: rateValue(wire, d, D, coils) },
    }
  },
})
