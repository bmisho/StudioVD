import { z } from "zod"
import { builtin, mm, segmentsFor } from "../../common"
import { toRuns } from "../../fastener/screw/heads"
import { BodyBuilder } from "../../mesh/builder"
import { outlineArea, type Outline, type Vec2 } from "../../mesh/outline"
import { extrude } from "../../mesh/prism"
import { revolve, revolvedVolume } from "../../mesh/revolve"
import { defineGenerator } from "../../types"
import { barAnchors } from "../ends"

const Params = z
  .object({
    diameterMm: z.number().min(0.5).max(500),
    lengthMm: z.number().min(1).max(5000),
    /** 45° chamfer at both ends (round shafts only). */
    chamferMm: z.number().min(0).max(10),
    /** Depth of a D flat along the whole length (0: round), as on motor shafts. */
    flatMm: z.number().min(0).max(100),
    material: z.enum(["steel", "stainless", "aluminium"]),
  })
  .strict()
  .refine((p) => p.chamferMm < p.diameterMm / 4 && p.chamferMm < p.lengthMm / 4, {
    message: "chamfer too large",
    path: ["chamferMm"],
  })
  .refine((p) => p.flatMm < p.diameterMm / 2, { message: "flat too deep", path: ["flatMm"] })

const MATERIALS = {
  steel: "std.steel",
  stainless: "std.stainless-304",
  aluminium: "std.aluminium-6061",
} as const

/** The outline of a round bar with a flat at u = r - f (one smooth arc, one flat side). */
function dOutline(r: number, f: number, n: number): Outline {
  const half = Math.acos((r - f) / r)
  const steps = Math.max(8, Math.round((n * (2 * Math.PI - 2 * half)) / (2 * Math.PI)))
  const arcRun: Vec2[] = Array.from({ length: steps + 1 }, (_, j) => {
    const a = half + ((2 * Math.PI - 2 * half) * j) / steps
    return [r * Math.cos(a), r * Math.sin(a)]
  })
  const [first, last] = [arcRun[0], arcRun.at(-1)]
  if (!first || !last) return []
  return [arcRun, [last, first]]
}

/** A round bar on the Y axis: plain, chamfered or with a D flat. */
export const stockShaft = defineGenerator({
  id: "stock.shaft",
  major: 1,
  version: "1.0.0",
  name: "Shaft",
  summary: "Round bar, optionally chamfered or with a D flat",
  category: ["mechanical", "stock"],
  tags: ["shaft", "rod", "axle", "bar"],
  params: Params,
  defaults: { diameterMm: 8, lengthMm: 100, chamferMm: 0.5, flatMm: 0, material: "steel" },
  presets: [
    {
      key: "rod8",
      name: "Ø8 × 300 linear rod",
      params: { diameterMm: 8, lengthMm: 300, chamferMm: 0.5, flatMm: 0, material: "steel" },
    },
    {
      key: "shaft5d",
      name: "Ø5 × 20 D shaft",
      params: { diameterMm: 5, lengthMm: 20, chamferMm: 0, flatMm: 0.5, material: "steel" },
    },
  ],
  sources: [],
  generate: ({ diameterMm: d, lengthMm: length, chamferMm: c0, flatMm: f, material }) => {
    const r = d / 2
    const n = segmentsFor(r)
    const b = new BodyBuilder()
    let volume: number
    if (f > 0) {
      const outline = dOutline(r, f, n)
      extrude(b, outline, [], 0, length)
      volume = outlineArea(outline) * length
    } else {
      const c = c0
      const profile: Vec2[] =
        c > 0
          ? [
              [0, 0],
              [r - c, 0],
              [r, c],
              [r, length - c],
              [r - c, length],
              [0, length],
            ]
          : [
              [0, 0],
              [r, 0],
              [r, length],
              [0, length],
            ]
      revolve(b, toRuns(profile), n)
      volume = revolvedVolume(profile)
    }
    return {
      name: `Shaft Ø${mm(d)} × ${mm(length)}${f > 0 ? " D" : ""}`,
      bodies: {
        shaft: {
          name: "Shaft",
          mesh: b.build(),
          material: "bar",
          collider: "hull",
          volumeMm3: volume,
        },
      },
      rootBody: "shaft",
      materials: { bar: builtin(MATERIALS[material]) },
      anchors: barAnchors("shaft", length, `shaft-${mm(d)}mm`),
      mates: {},
      suggestedMates: [],
      placement: { anchor: "start", groundIfFirst: false },
    }
  },
})
