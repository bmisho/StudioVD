import { z } from "zod"
import { builtin, mm, segmentsFor } from "../../common"
import { toRuns } from "../../fastener/screw/heads"
import { BodyBuilder } from "../../mesh/builder"
import type { Vec2 } from "../../mesh/outline"
import { revolve, revolvedVolume } from "../../mesh/revolve"
import { barAnchors } from "../../stock/ends"
import { defineGenerator } from "../../types"
import { T8, T8_SOURCES, leadValue } from "../t8"

const Params = z
  .object({
    lengthMm: z.number().min(10).max(1500),
    /** Lead per turn: 2 (one start), 4, or 8 (four starts, the usual T8x8). */
    leadMm: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8)]),
    /** Rings one pitch apart suggest the thread; plain is a bare Ø8 rod (fewer triangles). */
    thread: z.enum(["grooved", "plain"]),
  })
  .strict()

/** The (r, y) profile: chamfered ends and, when grooved, a trapezoid ring every pitch. */
function profile(length: number, grooved: boolean): Vec2[] {
  const [R, r, c] = [T8.major / 2, T8.minor / 2, 0.5]
  const points: Vec2[] = [
    [0, 0],
    [R - c, 0],
    [R, c],
  ]
  if (grooved) {
    const P = T8.pitch
    const rings = Math.floor((length - 2 * c - 0.6) / P)
    const start = (length - rings * P) / 2
    for (let k = 0; k < rings; k++) {
      const y = start + k * P
      points.push([R, y + 0.1], [r, y + 0.5], [r, y + 1.1], [R, y + 1.5])
    }
  }
  points.push([R, length - c], [R - c, length], [0, length])
  return points
}

/** A T8 trapezoidal lead screw on the Y axis. */
export const motionLeadScrew = defineGenerator({
  id: "motion.leadScrew",
  major: 1,
  version: "1.0.0",
  name: "T8 lead screw",
  summary: "8 mm trapezoidal lead screw (T8), lead 2, 4 or 8 mm",
  category: ["mechanical", "motion"],
  tags: ["lead screw", "t8", "trapezoidal", "acme", "z axis"],
  params: Params,
  defaults: { lengthMm: 300, leadMm: 8, thread: "grooved" },
  presets: [
    {
      key: "t8x8l300",
      name: "T8×8, 300 mm",
      params: { lengthMm: 300, leadMm: 8, thread: "grooved" },
    },
    {
      key: "t8x2l200",
      name: "T8×2, 200 mm",
      params: { lengthMm: 200, leadMm: 2, thread: "grooved" },
    },
    {
      key: "t8x8l100",
      name: "T8×8, 100 mm, plain",
      params: { lengthMm: 100, leadMm: 8, thread: "plain" },
    },
  ],
  sources: T8_SOURCES,
  generate: ({ lengthMm: length, leadMm, thread }) => {
    const points = profile(length, thread === "grooved")
    const b = new BodyBuilder()
    revolve(b, toRuns(points), thread === "grooved" ? 24 : segmentsFor(T8.major / 2)) // rings: 24 keeps it light
    return {
      name: `T8×${leadMm} lead screw, ${mm(length)} mm`,
      tags: [`t8x${leadMm}`],
      bodies: {
        screw: {
          name: "Lead screw",
          mesh: b.build(),
          material: "steel",
          collider: "hull",
          role: "moving",
          volumeMm3: revolvedVolume(points),
        },
      },
      rootBody: "screw",
      materials: { steel: builtin("std.stainless-304") },
      anchors: barAnchors("screw", length, "T8-screw"),
      mates: {},
      suggestedMates: [],
      placement: { anchor: "start", groundIfFirst: false },
      values: { lead: leadValue(leadMm) },
    }
  },
})
