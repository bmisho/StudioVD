import { z } from "zod"
import { builtin, computed, estimated, mm, segmentsFor } from "../../common"
import { BodyBuilder } from "../../mesh/builder"
import { circle, smoothRuns, type Outline } from "../../mesh/outline"
import { stack, type Section } from "../../mesh/stack"
import { defineGenerator, type GeneratedAnchor } from "../../types"
import { GT2_PITCH, GT2_PLD, gt2Outline, gt2PitchDiameter } from "./profile"

const Params = z
  .object({
    teeth: z.number().int().min(10).max(120),
    boreMm: z.number().min(1).max(50),
    beltWidthMm: z.union([z.literal(6), z.literal(9), z.literal(10)]),
    flanges: z.boolean(),
    /** A boss below for set screws; 0 for none. */
    hubDiameterMm: z.number().min(0).max(100),
    hubLengthMm: z.number().min(0).max(30),
  })
  .strict()

/** Flange: 1 mm thick, 1.5 mm above the tips. */
const FLANGE = { thickness: 1, rise: 1.5 }

/** A GT2 timing pulley lying flat (axis Y): hub below, flanged toothed section above. */
export const pulleyGt2 = defineGenerator({
  id: "pulley.gt2",
  major: 1,
  version: "1.0.0",
  name: "GT2 pulley",
  summary: "GT2 2 mm timing belt pulley with bore, flanges and hub",
  category: ["mechanical", "pulleys"],
  tags: ["pulley", "gt2", "timing belt", "2gt"],
  designatorPrefix: "PU",
  params: Params,
  defaults: {
    teeth: 20,
    boreMm: 5,
    beltWidthMm: 6,
    flanges: true,
    hubDiameterMm: 12,
    hubLengthMm: 7,
  },
  presets: [
    {
      key: "z16b5",
      name: "16 teeth, bore 5",
      params: {
        teeth: 16,
        boreMm: 5,
        beltWidthMm: 6,
        flanges: true,
        hubDiameterMm: 10,
        hubLengthMm: 7,
      },
    },
    {
      key: "z20b5",
      name: "20 teeth, bore 5",
      params: {
        teeth: 20,
        boreMm: 5,
        beltWidthMm: 6,
        flanges: true,
        hubDiameterMm: 12,
        hubLengthMm: 7,
      },
    },
    {
      key: "z20b8",
      name: "20 teeth, bore 8",
      params: {
        teeth: 20,
        boreMm: 8,
        beltWidthMm: 6,
        flanges: true,
        hubDiameterMm: 12,
        hubLengthMm: 7,
      },
    },
    {
      key: "z36b8",
      name: "36 teeth, bore 8",
      params: {
        teeth: 36,
        boreMm: 8,
        beltWidthMm: 6,
        flanges: true,
        hubDiameterMm: 16,
        hubLengthMm: 7,
      },
    },
    {
      key: "z60b8",
      name: "60 teeth, bore 8",
      params: {
        teeth: 60,
        boreMm: 8,
        beltWidthMm: 6,
        flanges: false,
        hubDiameterMm: 16,
        hubLengthMm: 7,
      },
    },
  ],
  sources: [
    {
      what: "Pitch and PLD",
      source: estimated(
        "GT2 2 mm: pitch 2 mm, pitch line 0.254 mm outside the tips (published GT2 pulley data)",
        "medium"
      ),
    },
    {
      what: "Groove, flanges, hub",
      source: estimated("Visual: one 0.6 mm arc 0.75 mm deep; typical printer pulley sizes", "low"),
    },
  ],
  generate: ({ teeth: z, boreMm, beltWidthMm, flanges, hubDiameterMm, hubLengthMm }) => {
    const ro = gt2PitchDiameter(z) / 2 - GT2_PLD
    if (boreMm / 2 > ro - 1.5) throw new Error("The bore leaves no material under the teeth.")
    const toothed = smoothRuns(gt2Outline(z), 25)
    const width = beltWidthMm + 1
    const rf = ro + FLANGE.rise
    const flange = circle(rf, segmentsFor(rf))
    const hub = hubDiameterMm > 0 && hubLengthMm > 0
    let hubOutline: Outline | undefined
    if (hub) {
      if (hubDiameterMm <= boreMm + 1) throw new Error("The hub must be wider than the bore.")
      const sameAsFlange = flanges && Math.abs(hubDiameterMm / 2 - rf) < 0.25
      hubOutline = sameAsFlange ? flange : circle(hubDiameterMm / 2, segmentsFor(hubDiameterMm / 2))
    }
    const sections: Section[] = []
    let y = 0
    const push = (outline: Outline, h: number) => {
      sections.push({ outline, y0: y, y1: y + h })
      y += h
    }
    if (hubOutline) push(hubOutline, hubLengthMm)
    if (flanges) push(flange, FLANGE.thickness)
    const beltY = y + width / 2
    push(toothed, width)
    if (flanges) push(flange, FLANGE.thickness)
    const b = new BodyBuilder()
    const volume = stack(b, sections, circle(boreMm / 2, segmentsFor(rf)))
    const axial = (name: string, at: number, up: boolean, extra = {}): GeneratedAnchor => ({
      body: "pulley",
      name,
      kind: "axial",
      frame: { originMm: [0, at, 0], z: [0, up ? 1 : -1, 0], x: [1, 0, 0] },
      ...extra,
    })
    const boreTag = `bore-${mm(boreMm)}mm`
    return {
      name: `GT2 pulley ${z}T, bore ${mm(boreMm)}`,
      tags: [`${z}t`, boreTag],
      bodies: {
        pulley: {
          name: "Pulley",
          mesh: b.build(),
          material: "alu",
          collider: "decomposed",
          volumeMm3: volume,
        },
      },
      rootBody: "pulley",
      materials: { alu: builtin("std.aluminium-6061") },
      anchors: {
        belt: axial("Belt line", beltY, true, { role: "port" }),
        bore: axial("Bore", y, true, { interface: boreTag, role: "mate" }),
        boreBack: axial("Bore, back", 0, false, { interface: boreTag }),
        face: {
          body: "pulley",
          name: "Face",
          kind: "planar",
          frame: { originMm: [0, 0, 0], z: [0, -1, 0], x: [1, 0, 0] },
          role: "placement",
        },
      },
      mates: {},
      suggestedMates: [
        { anchor: "boreBack", mateType: "revolute", flip: true, label: "On a motor shaft" },
      ],
      placement: { anchor: "face", groundIfFirst: false },
      values: {
        pitchDiameter: {
          value: gt2PitchDiameter(z),
          unit: "mm",
          source: computed(`d_p = z p / π, p = ${GT2_PITCH} mm`),
        },
      },
    }
  },
})
