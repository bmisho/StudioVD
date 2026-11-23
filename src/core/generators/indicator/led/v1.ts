import { z } from "zod"
import { builtin, estimated, frameAt } from "../../common"
import { axialY } from "../../control/parts"
import { tinted } from "../../materials"
import { BodyBuilder } from "../../mesh/builder"
import { at, circle, rectangle, type Vec2 } from "../../mesh/outline"
import { extrude } from "../../mesh/prism"
import { arc, revolve, revolvedVolume } from "../../mesh/revolve"
import { stack } from "../../mesh/stack"
import { defineGenerator, type GeneratedAnchor } from "../../types"

/** A 5 mm (T-1 3/4) LED: body, flange, height to the dome's top, leads (estimated typicals). */
const LED = {
  body: 5,
  flange: 5.8,
  flangeHeight: 1,
  height: 8.6,
  lead: 0.5,
  spacing: 2.54,
} as const
const BEZEL = { outer: 8, length: 4 } as const

const COLOURS = {
  red: "#e53935",
  green: "#43a047",
  yellow: "#fdd835",
  blue: "#1e88e5",
  white: "#f5f5f5",
} as const

const Params = z
  .object({
    colour: z.enum(["red", "green", "yellow", "blue", "white"]),
    leadLengthMm: z.number().min(2).max(40),
    bezel: z.boolean(),
  })
  .strict()

/**
 * A 5 mm through-hole LED standing on its flange (y = 0), lens up (PLAN 16.4), its leads'
 * tips the cable ends, optionally in a chrome panel bezel.
 */
export const indicatorLed = defineGenerator({
  id: "indicator.led",
  major: 1,
  version: "1.0.0",
  name: "LED",
  summary: "5 mm LED with leads, optionally in a panel bezel",
  category: ["electrical", "indicators"],
  tags: ["led", "5mm", "indicator", "bezel", "pedal"],
  designatorPrefix: "D",
  params: Params,
  defaults: { colour: "red", leadLengthMm: 15, bezel: true },
  presets: (["red", "green", "blue"] as const).map((colour) => ({
    key: colour,
    name: `${colour[0]?.toUpperCase()}${colour.slice(1)} LED in a bezel`,
    params: { colour, leadLengthMm: 15, bezel: true },
  })),
  sources: [
    {
      what: "LED",
      source: estimated(
        "Typical 5 mm (T-1 3/4) LEDs: Ø5.0 body, Ø5.8 × 1.0 mm flange, 8.6 mm tall, 0.5 mm square leads 2.54 mm apart",
        "medium"
      ),
    },
    { what: "Bezel", source: estimated("Chrome 5 mm LED bezel: about Ø8 × 4 mm", "low") },
  ],
  generate: ({ colour, leadLengthMm, bezel }) => {
    const [rf, rb] = [LED.flange / 2, LED.body / 2]
    const dome = LED.height - rb
    const profile: Vec2[][] = [
      [
        [0, 0],
        [rf, 0],
      ],
      [
        [rf, 0],
        [rf, LED.flangeHeight],
      ],
      [
        [rf, LED.flangeHeight],
        [rb, LED.flangeHeight],
      ],
      [
        [rb, LED.flangeHeight],
        [rb, dome],
      ],
      arc([0, dome], rb, 0, Math.PI / 2, 8),
    ]
    const b = new BodyBuilder()
    revolve(b, profile, 32, 0)
    let volume = revolvedVolume(profile.flatMap((run, i) => (i === 0 ? run : run.slice(1))))
    const anchors: Record<string, GeneratedAnchor> = {
      lens: axialY("led", "Lens", LED.height, true, { role: "reference" }),
      flange: axialY("led", "Flange", 0, false, { kind: "planar", role: "placement" }),
    }
    const leads = [
      { key: "anode", name: "Anode (+)", u: LED.spacing / 2 },
      { key: "cathode", name: "Cathode (−)", u: -LED.spacing / 2 },
    ]
    for (const l of leads) {
      extrude(b, rectangle(LED.lead, LED.lead, l.u, 0), [], -leadLengthMm, 0.5, 1)
      volume += LED.lead * LED.lead * (leadLengthMm + 0.5)
      anchors[l.key] = {
        body: "led",
        name: l.name,
        kind: "point",
        frame: frameAt(at([l.u, 0], -leadLengthMm), [0, -1, 0], [1, 0, 0]),
        role: "port",
      }
    }
    if (bezel) {
      volume += stack(
        b,
        [{ outline: circle(BEZEL.outer / 2, 32), y0: 0.5, y1: 0.5 + BEZEL.length }],
        circle(rf + 0.1, 32),
        2
      )
      anchors.panel = axialY("led", "Bezel", 0.5, true, { role: "mate", interface: "bezel-8mm" })
    }
    return {
      name: `${colour[0]?.toUpperCase()}${colour.slice(1)} 5 mm LED${bezel ? " in a bezel" : ""}`,
      tags: [colour],
      bodies: {
        led: {
          name: "LED",
          mesh: b.build(),
          material: "lens",
          slots: [
            { name: "Lens", material: "lens" },
            { name: "Leads", material: "metal" },
            ...(bezel ? [{ name: "Bezel", material: "metal" }] : []),
          ],
          collider: "hull",
          role: "emitter",
          volumeMm3: volume,
        },
      },
      rootBody: "led",
      materials: {
        lens: tinted("std.pc-clear", `${colour} LED lens`, COLOURS[colour], 1200),
        metal: builtin("std.steel"),
      },
      anchors,
      mates: {},
      suggestedMates: [],
      placement: { anchor: "flange", groundIfFirst: false },
    }
  },
})
