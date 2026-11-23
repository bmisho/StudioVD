import { z } from "zod"
import { estimated, frameAt, mm, segmentsFor } from "../../common"
import { tinted } from "../../materials"
import { BodyBuilder } from "../../mesh/builder"
import { rectangle, type Vec2 } from "../../mesh/outline"
import { extrude } from "../../mesh/prism"
import { revolve, revolvedVolume } from "../../mesh/revolve"
import { defineGenerator } from "../../types"
import { axialY } from "../parts"

const Params = z
  .object({
    diameterMm: z.number().min(6).max(80),
    heightMm: z.number().min(4).max(60),
    skirt: z.boolean(),
    skirtDiameterMm: z.number().min(7).max(100),
    skirtHeightMm: z.number().min(0.5).max(20),
    boreMm: z.number().min(2).max(12),
    boreDepthMm: z.number().min(2).max(50),
    pointer: z.boolean(),
  })
  .strict()
  .refine((p) => p.boreMm < p.diameterMm - 2, "the bore must leave a wall")
  .refine((p) => p.boreDepthMm < p.heightMm - 1, "the bore must stop below the top")
  .refine((p) => !p.skirt || p.skirtDiameterMm > p.diameterMm, "the skirt must be wider")
  .refine((p) => !p.skirt || p.skirtHeightMm < p.heightMm - 2, "the skirt must be lower")

const DEFAULTS = {
  diameterMm: 20,
  heightMm: 15,
  skirt: true,
  skirtDiameterMm: 24,
  skirtHeightMm: 3,
  boreMm: 6,
  boreDepthMm: 10,
  pointer: true,
}

/**
 * A control knob (PLAN 16.4) standing on its open bore (y = 0), axis Y: an optional skirt,
 * a slightly tapered grip with a rounded top edge and a white pointer line on top. Its
 * `bore` anchor is the bore's ceiling, so a fixed mate to a shaft's tip seats it over the
 * shaft.
 */
export const controlKnob = defineGenerator({
  id: "control.knob",
  major: 1,
  version: "1.0.0",
  name: "Knob",
  summary: "Control knob with a blind bore, optional skirt and pointer",
  category: ["electrical", "controls"],
  tags: ["knob", "pedal", "potentiometer", "dial"],
  params: Params,
  defaults: DEFAULTS,
  presets: [
    { key: "skirted6", name: "Skirted knob, Ø6 bore", params: DEFAULTS },
    {
      key: "skirted635",
      name: "Skirted knob, 1/4 in bore",
      params: { ...DEFAULTS, boreMm: 6.35, diameterMm: 22, skirtDiameterMm: 27 },
    },
    {
      key: "plain6",
      name: "Plain knob, Ø6 bore",
      params: { ...DEFAULTS, skirt: false, diameterMm: 15, heightMm: 16 },
    },
  ],
  sources: [
    {
      what: "Knob sizes",
      source: estimated(
        "Visual starting sizes for pedal knobs (about Ø15-25 mm, 15 mm tall, Ø6 mm or 1/4 in bore); edit to match the knob you use",
        "low"
      ),
    },
    {
      what: "Knob density",
      source: estimated("ABS 1.04-1.06 g/cm³ (typical published range)", "medium"),
    },
  ],
  generate: (p) => {
    const R = p.diameterMm / 2
    const top = R * 0.92
    const round = Math.min(1.2, (p.heightMm - (p.skirt ? p.skirtHeightMm : 0)) / 4)
    const rb = p.boreMm / 2
    const base = p.skirt ? p.skirtHeightMm : 0
    const profile: Vec2[][] = [
      [
        [0, p.boreDepthMm],
        [rb, p.boreDepthMm],
      ],
      [
        [rb, p.boreDepthMm],
        [rb, 0],
      ],
    ]
    const ring: Vec2 = p.skirt ? [p.skirtDiameterMm / 2, 0] : [R, 0]
    profile.push([[rb, 0], ring])
    if (p.skirt) {
      const rs = p.skirtDiameterMm / 2
      profile.push(
        [ring, [rs, base]],
        [
          [rs, base],
          [R, base],
        ]
      )
    }
    const edge: Vec2[] = Array.from({ length: 5 }, (_, j) => {
      const a = (j * Math.PI) / 8
      return [top - round + round * Math.cos(a), p.heightMm - round + round * Math.sin(a)]
    })
    profile.push(
      [
        [R, base],
        [top, p.heightMm - round],
      ],
      edge,
      [
        [top - round, p.heightMm],
        [0, p.heightMm],
      ]
    )
    const b = new BodyBuilder()
    revolve(b, profile, segmentsFor(R), 0)
    const points = profile.flatMap((run, i) => (i === 0 ? run : run.slice(1)))
    let volume = revolvedVolume(points)
    if (p.pointer) {
      const len = (top - round) * 0.8
      extrude(b, rectangle(1, len, 0, len / 2 + 0.5), [], p.heightMm - 0.2, p.heightMm + 0.1, 1)
      volume += len * 0.3
    }
    return {
      name: `Knob Ø${mm(p.diameterMm)}, Ø${mm(p.boreMm)} bore`,
      tags: [p.skirt ? "skirted" : "plain"],
      bodies: {
        knob: {
          name: "Knob",
          mesh: b.build(),
          material: "knob",
          ...(p.pointer && {
            slots: [
              { name: "Knob", material: "knob" },
              { name: "Pointer", material: "pointer" },
            ],
          }),
          collider: "hull",
          role: "actuator",
          volumeMm3: volume,
        },
      },
      rootBody: "knob",
      materials: {
        knob: tinted("std.abs", "Black knob", "#1c1c1c", 1050),
        pointer: tinted("std.abs", "White pointer", "#f4f4f4", 1050),
      },
      anchors: {
        bore: axialY("knob", "Bore", p.boreDepthMm, false, {
          role: "mate",
          interface: `shaft-${mm(p.boreMm)}mm`,
        }),
        top: {
          body: "knob",
          name: "Top",
          kind: "planar",
          frame: frameAt([0, p.heightMm, 0], [0, 1, 0], [1, 0, 0]),
          role: "reference",
        },
      },
      mates: {},
      suggestedMates: [
        { anchor: "bore", mateType: "fixed", flip: true, label: "On a shaft's tip" },
      ],
      placement: { anchor: "bore", groundIfFirst: false },
    }
  },
})
