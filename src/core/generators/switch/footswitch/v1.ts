import { z } from "zod"
import { builtin, estimated, frameAt, mm, segmentsFor } from "../../common"
import { axialY } from "../../control/parts"
import { BLACK_PBT } from "../../materials"
import { BodyBuilder } from "../../mesh/builder"
import { at, circle, rectangle } from "../../mesh/outline"
import { extrude } from "../../mesh/prism"
import { stack } from "../../mesh/stack"
import { defineGenerator, type GeneratedAnchor } from "../../types"

const Params = z
  .object({
    poles: z.union([z.literal(2), z.literal(3)]),
    bodyWidthMm: z.number().min(10).max(40),
    bodyDepthMm: z.number().min(8).max(50),
    bushingDiameterMm: z.number().min(6).max(20),
    bushingLengthMm: z.number().min(3).max(30),
    plungerDiameterMm: z.number().min(4).max(18),
    plungerLengthMm: z.number().min(3).max(30),
    lugPitchMm: z.number().min(2).max(10),
  })
  .strict()
  .refine((p) => p.bushingDiameterMm < p.bodyWidthMm, "the bushing must be narrower than the body")
  .refine((p) => p.plungerDiameterMm < p.bushingDiameterMm, "the plunger must be narrower")
  .refine((p) => p.lugPitchMm * 2 + 2 < p.bodyWidthMm, "the lugs must fit the body's back")

const DEFAULTS = {
  poles: 3 as const,
  bodyWidthMm: 17,
  bodyDepthMm: 16,
  bushingDiameterMm: 12,
  bushingLengthMm: 10,
  plungerDiameterMm: 10,
  plungerLengthMm: 12,
  lugPitchMm: 4.8,
}

const LUG = { width: 1.6, thickness: 0.5, length: 6 } as const
/** How far the plunger goes down when stamped on (0.2.2; estimated, see sources). */
const TRAVEL_MM = 2.5
const TRAVEL_SOURCE = estimated(
  "Stomp footswitches travel about 2-3 mm to latch; 2.5 mm taken. Check the datasheet",
  "low"
)
const POLE_NAMES = ["A", "B", "C"] as const
const THROWS = ["out 1", "common", "out 2"] as const

/**
 * A latching stomp footswitch (PLAN 16.4): its square body behind the panel (y = 0 is the
 * mounting face), the threaded bushing through it, and a grid of solder lugs on the back: one
 * row per pole, the common in the middle (cable ends). Since 1.1 the plunger is a body of its
 * own on a `press` slide (2.5 mm down), so test mode can stamp on it and a binding can read it.
 */
export const switchFootswitch = defineGenerator({
  id: "switch.footswitch",
  major: 1,
  version: "1.1.0",
  name: "Footswitch",
  summary: "Stomp footswitch, 3PDT or DPDT, with a grid of solder lugs",
  category: ["electrical", "switches"],
  tags: ["footswitch", "stomp", "3pdt", "dpdt", "pedal", "switch"],
  designatorPrefix: "SW",
  params: Params,
  defaults: DEFAULTS,
  presets: [
    { key: "threePole", name: "3PDT footswitch", params: DEFAULTS },
    { key: "twoPole", name: "DPDT footswitch", params: { ...DEFAULTS, poles: 2 } },
  ],
  sources: [
    {
      what: "Footswitch sizes",
      source: estimated(
        "Typical latching 3PDT stomp switches: M12 bushing, about 17 mm square body, 9 lugs on a grid of about 4.8 mm. Check the datasheet of the part you use",
        "low"
      ),
    },
    { what: "Plunger travel", source: TRAVEL_SOURCE },
  ],
  generate: (p) => {
    const b = new BodyBuilder()
    const W = p.bodyWidthMm
    const rb = p.bushingDiameterMm / 2
    const rp = p.plungerDiameterMm / 2
    const top = p.bushingLengthMm + p.plungerLengthMm
    extrude(b, rectangle(W, W), [], -p.bodyDepthMm, 0)
    let volume = W * W * p.bodyDepthMm
    // The bushing in metal, sunk 0.5 mm into the body so they share no face with it.
    volume += stack(
      b,
      [{ outline: circle(rb, segmentsFor(rb)), y0: -0.5, y1: p.bushingLengthMm }],
      undefined,
      2
    )
    // The plunger reaches into the bushing past its travel, so stamped down it shows no gap.
    const plunger = new BodyBuilder()
    const plungerVolume = stack(plunger, [
      { outline: circle(rp, segmentsFor(rp)), y0: p.bushingLengthMm - TRAVEL_MM - 1, y1: top },
    ])
    const anchors: Record<string, GeneratedAnchor> = {
      mount: axialY("switch", "Mounting face", 0, true, {
        kind: "planar",
        role: "mount",
        interface: "panel",
      }),
      bushing: axialY("switch", "Bushing", 0, true, {
        role: "mate",
        interface: `bushing-${mm(p.bushingDiameterMm)}mm`,
      }),
      plunger: axialY("plunger", "Plunger", top, true, { role: "reference" }),
      guide: axialY("switch", "Plunger guide", p.bushingLengthMm, true, { role: "reference" }),
      plungerAxis: axialY("plunger", "Plunger axis", p.bushingLengthMm, true, {
        role: "reference",
      }),
    }
    // Lugs out of the back, starting 1 mm inside it: rows are poles, columns the throws.
    const yTip = -p.bodyDepthMm - LUG.length
    for (let row = 0; row < p.poles; row++)
      for (let col = 0; col < 3; col++) {
        const [u, v] = [(col - 1) * p.lugPitchMm, (row - (p.poles - 1) / 2) * p.lugPitchMm]
        extrude(b, rectangle(LUG.width, LUG.thickness, u, v), [], yTip, -p.bodyDepthMm + 1, 1)
        volume += LUG.width * LUG.thickness * (LUG.length + 1)
        anchors[`lug${row * 3 + col + 1}`] = {
          body: "switch",
          name: `Pole ${POLE_NAMES[row] ?? row + 1} ${THROWS[col] ?? col + 1}`,
          kind: "point",
          frame: frameAt(at([u, v], yTip), [0, -1, 0], [1, 0, 0]),
          role: "port",
        }
      }
    return {
      name: `${p.poles === 3 ? "3PDT" : "DPDT"} footswitch`,
      tags: [p.poles === 3 ? "3pdt" : "dpdt"],
      bodies: {
        switch: {
          name: "Footswitch",
          mesh: b.build(),
          material: "body",
          slots: [
            { name: "Body", material: "body" },
            { name: "Lugs", material: "lugs" },
            { name: "Bushing", material: "metal" },
          ],
          collider: "hull",
          role: "body",
          volumeMm3: volume,
        },
        plunger: {
          name: "Plunger",
          mesh: plunger.build(),
          material: "metal",
          collider: "hull",
          role: "actuator",
          volumeMm3: plungerVolume,
        },
      },
      rootBody: "switch",
      materials: { body: BLACK_PBT(), lugs: builtin("std.brass"), metal: builtin("std.steel") },
      anchors,
      mates: {
        press: {
          name: "Plunger presses",
          type: "prismatic",
          anchorA: "guide",
          anchorB: "plungerAxis",
          flip: false,
          angleOffsetRad: 0,
          contactsEnabled: false,
          limits: { min: -TRAVEL_MM, max: 0 },
          limitsSource: TRAVEL_SOURCE,
        },
      },
      suggestedMates: [{ anchor: "mount", mateType: "fixed", flip: true, label: "Behind a panel" }],
      placement: { anchor: "mount", groundIfFirst: false },
    }
  },
})
