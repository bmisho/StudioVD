import { z } from "zod"
import { degToRad } from "@/core/units"
import { builtin, mm, segmentsFor } from "../../common"
import { BodyBuilder } from "../../mesh/builder"
import { circle } from "../../mesh/outline"
import { stack } from "../../mesh/stack"
import { defineGenerator } from "../../types"
import { axialY, dOutline, lugAnchors, lugTabs, type Lug } from "../parts"
import { POTS, ROTATION_SOURCE } from "./table"

const Params = z
  .object({
    bodyDiameterMm: z.number().min(8).max(60),
    bodyDepthMm: z.number().min(3).max(40),
    bushingDiameterMm: z.number().min(3).max(20),
    bushingLengthMm: z.number().min(2).max(30),
    shaftDiameterMm: z.number().min(2).max(12),
    shaftLengthMm: z.number().min(4).max(80),
    shaft: z.enum(["round", "d"]),
    lugPitchMm: z.number().min(2).max(15),
  })
  .strict()
  .refine(
    (p) => p.bushingDiameterMm < p.bodyDiameterMm,
    "the bushing must be narrower than the body"
  )
  .refine(
    (p) => p.shaftDiameterMm < p.bushingDiameterMm,
    "the shaft must be narrower than the bushing"
  )
  .refine((p) => p.shaftLengthMm > p.bushingLengthMm + 1, "the shaft must stand out of the bushing")
  .refine((p) => p.lugPitchMm * 2 + 2.4 < p.bodyDiameterMm, "the lugs must fit the body")

/** Parameters in the schema's order (the form lists them so). */
const preset = (key: keyof typeof POTS, shaft: "round" | "d") => {
  const t = POTS[key]
  return {
    bodyDiameterMm: t.bodyDiameterMm,
    bodyDepthMm: t.bodyDepthMm,
    bushingDiameterMm: t.bushingDiameterMm,
    bushingLengthMm: t.bushingLengthMm,
    shaftDiameterMm: t.shaftDiameterMm,
    shaftLengthMm: t.shaftLengthMm,
    shaft,
    lugPitchMm: t.lugPitchMm,
  }
}

/**
 * A panel-mount rotary potentiometer (PLAN 16.4): body behind the panel, bushing and shaft
 * along +Y through it (y = 0 is the mounting face), three solder lugs, and the shaft as its
 * own body turning 300° on a built-in limited revolute mate (bind it to a schematic pot).
 */
export const controlPot = defineGenerator({
  id: "control.pot",
  major: 1,
  version: "1.0.0",
  name: "Potentiometer",
  summary: "Panel-mount rotary pot: 16 or 24 mm body, bushing, shaft and three lugs",
  category: ["electrical", "controls"],
  tags: ["potentiometer", "pot", "knob", "pedal", "rotary"],
  designatorPrefix: "RV",
  params: Params,
  defaults: preset("16mm", "d"),
  presets: [
    { key: "p16", name: POTS["16mm"].name, params: preset("16mm", "d") },
    { key: "p24", name: POTS["24mm"].name, params: preset("24mm", "round") },
  ],
  sources: [
    ...Object.values(POTS).map((p) => ({ what: p.name, source: p.source })),
    { what: "Rotation", source: ROTATION_SOURCE },
  ],
  generate: (p) => {
    const R = p.bodyDiameterMm / 2
    const body = circle(R, segmentsFor(R))
    const bushing = circle(p.bushingDiameterMm / 2, segmentsFor(p.bushingDiameterMm / 2))
    const housing = new BodyBuilder()
    let housingVolume = stack(housing, [
      { outline: body, y0: -p.bodyDepthMm, y1: 0 },
      { outline: bushing, y0: 0, y1: p.bushingLengthMm },
    ])
    // Three lugs out of the body's rim, side by side at the bottom (+v is world −Z).
    const lugs: Lug[] = [-1, 0, 1].map((k) => ({
      u: k * p.lugPitchMm,
      from: R - 3,
      tip: R + 5,
      y: -p.bodyDepthMm / 2,
    }))
    housingVolume += lugTabs(housing, lugs, 2.4, 0.5, 1)
    const rs = p.shaftDiameterMm / 2
    const n = segmentsFor(rs)
    const section = p.shaft === "d" ? dOutline(rs, rs * 0.3, n) : circle(rs, n)
    const shaft = new BodyBuilder()
    const shaftVolume = stack(shaft, [
      { outline: section, y0: p.bushingLengthMm, y1: p.shaftLengthMm },
    ])
    const label = `${mm(p.bodyDiameterMm)} mm`
    return {
      name: `Potentiometer ${label}, Ø${mm(p.shaftDiameterMm)} shaft`,
      tags: [label.replace(" ", ""), p.shaft === "d" ? "d-shaft" : "round shaft"],
      bodies: {
        housing: {
          name: "Housing",
          mesh: housing.build(),
          material: "case",
          slots: [
            { name: "Case", material: "case" },
            { name: "Lugs", material: "lugs" },
          ],
          collider: "hull",
          role: "body",
          volumeMm3: housingVolume,
        },
        shaft: {
          name: "Shaft",
          mesh: shaft.build(),
          material: "case",
          collider: "hull",
          role: "moving",
          volumeMm3: shaftVolume,
        },
      },
      rootBody: "housing",
      materials: { case: builtin("std.steel"), lugs: builtin("std.brass") },
      anchors: {
        mount: axialY("housing", "Mounting face", 0, true, {
          kind: "planar",
          role: "mount",
          interface: "panel",
        }),
        bushing: axialY("housing", "Bushing", 0, true, {
          role: "mate",
          interface: `bushing-${mm(p.bushingDiameterMm)}mm`,
        }),
        axis: axialY("housing", "Axis", 0, true, { role: "reference" }),
        shaftAxis: axialY("shaft", "Shaft axis", 0, true, { role: "reference" }),
        shaftTip: axialY("shaft", "Shaft tip", p.shaftLengthMm, true, {
          role: "mate",
          interface: `shaft-${mm(p.shaftDiameterMm)}mm`,
        }),
        ...lugAnchors("housing", lugs, [
          "Lug 1 (counter-clockwise end)",
          "Lug 2 (wiper)",
          "Lug 3 (clockwise end)",
        ]),
      },
      mates: {
        turn: {
          name: "Shaft turns",
          type: "revolute",
          anchorA: "axis",
          anchorB: "shaftAxis",
          flip: false,
          angleOffsetRad: 0,
          contactsEnabled: false,
          limits: { min: -degToRad(150), max: degToRad(150) },
          limitsSource: ROTATION_SOURCE,
        },
      },
      suggestedMates: [{ anchor: "mount", mateType: "fixed", flip: true, label: "Behind a panel" }],
      placement: { anchor: "mount", groundIfFirst: false },
    }
  },
})
