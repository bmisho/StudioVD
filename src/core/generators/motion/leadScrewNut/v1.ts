import { z } from "zod"
import { builtin, segmentsFor } from "../../common"
import { BodyBuilder } from "../../mesh/builder"
import { circle, circleAt, outlineArea } from "../../mesh/outline"
import { cap } from "../../mesh/planar"
import { wall } from "../../mesh/prism"
import { defineGenerator, type GeneratedAnchor } from "../../types"
import { T8, T8_NUT, T8_SOURCES, leadValue } from "../t8"

const Params = z
  .object({ leadMm: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(8)]) })
  .strict()

/** A brass flanged T8 nut, flange down (y = 0) and barrel up, its thread as a plain bore. */
export const motionLeadScrewNut = defineGenerator({
  id: "motion.leadScrewNut",
  major: 1,
  version: "1.0.0",
  name: "T8 flanged nut",
  summary: "Brass flanged nut for T8 lead screws",
  category: ["mechanical", "motion"],
  tags: ["lead screw nut", "t8", "flanged nut", "brass"],
  params: Params,
  defaults: { leadMm: 8 },
  presets: [
    { key: "t8x8", name: "T8×8 nut", params: { leadMm: 8 } },
    { key: "t8x2", name: "T8×2 nut", params: { leadMm: 2 } },
  ],
  sources: T8_SOURCES,
  generate: ({ leadMm }) => {
    const N = T8_NUT
    const [rf, rb] = [N.flangeDiameter / 2, N.barrelDiameter / 2]
    const n = segmentsFor(rf)
    const flange = circle(rf, n)
    const barrel = circle(rb, n)
    const bore = circle(T8.major / 2, n)
    const holeCentres = [0, 1, 2, 3].map((k) => {
      const a = Math.PI / 4 + (k * Math.PI) / 2
      return [(N.holeCircle / 2) * Math.cos(a), (N.holeCircle / 2) * Math.sin(a)] as const
    })
    const holes = holeCentres.map((c) => circleAt(c, N.holeDiameter / 2, 16))
    const [t, h] = [N.flangeThickness, N.length]
    const b = new BodyBuilder()
    wall(b, flange, 0, flange, t, true)
    cap(b, 0, flange, [bore, ...holes], false)
    cap(b, t, flange, [barrel, ...holes], true)
    for (const hole of holes) wall(b, hole, 0, hole, t, false)
    wall(b, barrel, t, barrel, h, true)
    cap(b, h, barrel, [bore], true)
    wall(b, bore, 0, bore, h, false)
    const volume =
      (outlineArea(flange) - holes.reduce((s, o) => s + outlineArea(o), 0)) * t +
      outlineArea(barrel) * (h - t) -
      outlineArea(bore) * h
    const down = (name: string, u: number, v: number, extra = {}): GeneratedAnchor => ({
      body: "nut",
      name,
      kind: "axial",
      frame: { originMm: [u, 0, -v], z: [0, -1, 0], x: [1, 0, 0] },
      ...extra,
    })
    return {
      name: `T8×${leadMm} flanged nut`,
      tags: [`t8x${leadMm}`],
      bodies: {
        nut: {
          name: "Nut",
          mesh: b.build(),
          material: "brass",
          collider: "decomposed",
          role: "moving",
          volumeMm3: volume,
        },
      },
      rootBody: "nut",
      materials: { brass: builtin("std.brass") },
      anchors: {
        thread: down("Thread", 0, 0, { interface: "T8-nut", role: "mate" }),
        flange: {
          body: "nut",
          name: "Flange face",
          kind: "planar",
          frame: { originMm: [0, 0, 0], z: [0, -1, 0], x: [1, 0, 0] },
          role: "placement",
        },
        ...Object.fromEntries(
          holeCentres.map((c, k) => [
            `hole${k + 1}`,
            down(`Hole ${k + 1}`, c[0], c[1], { interface: "M3-hole" }),
          ])
        ),
      },
      mates: {},
      suggestedMates: [
        { anchor: "thread", mateType: "revolute", flip: false, label: "On a T8 lead screw" },
      ],
      placement: { anchor: "flange", groundIfFirst: false },
      values: { lead: leadValue(leadMm) },
    }
  },
})
