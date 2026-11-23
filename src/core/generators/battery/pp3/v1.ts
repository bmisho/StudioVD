import { z } from "zod"
import { builtin, estimated, frameAt, standard } from "../../common"
import { axialY } from "../../control/parts"
import { tinted } from "../../materials"
import { BodyBuilder } from "../../mesh/builder"
import { at, circleAt, hexagon, outlineArea, roundedRect, shifted } from "../../mesh/outline"
import { extrude } from "../../mesh/prism"
import { defineGenerator, type GeneratedAnchor } from "../../types"

/** IEC 60086-2 6LR61 maxima (overall height includes the terminals) and terminal spacing. */
const PP3 = { width: 26.5, depth: 17.5, height: 48.5, spacing: 12.7 } as const
/** Terminal studs: round positive, hexagonal negative, both 2.1 mm proud (estimated). */
const TERMINAL = { height: 2.1, plus: 5.6, minus: 8 } as const
const SNAP = { width: 26, depth: 16.5, height: 8 } as const

const Params = z.object({ snap: z.boolean() }).strict()

/**
 * A 9 V PP3 (6LR61) battery standing on its base, terminals up (PLAN 16.4), optionally with
 * a snap clip on: its red and black leads' anchors are where cables start.
 */
export const batteryPp3 = defineGenerator({
  id: "battery.pp3",
  major: 1,
  version: "1.0.0",
  name: "9 V battery",
  summary: "PP3 (6LR61) 9 V battery, with or without its snap clip",
  category: ["electrical", "batteries"],
  tags: ["battery", "9v", "pp3", "6lr61", "snap", "pedal"],
  designatorPrefix: "BT",
  params: Params,
  defaults: { snap: true },
  presets: [
    { key: "snap", name: "9 V battery with snap", params: { snap: true } },
    { key: "bare", name: "9 V battery", params: { snap: false } },
  ],
  sources: [
    {
      what: "Battery size",
      source: standard("IEC 60086-2 6LR61 maxima: 48.5 × 26.5 × 17.5 mm; terminals 12.7 mm apart"),
    },
    {
      what: "Terminals and snap",
      source: estimated(
        "Terminal studs about Ø5.6 (round +) and 8 mm hex (−), 2.1 mm proud; snap housing about 26 × 16.5 × 8 mm",
        "low"
      ),
    },
    { what: "Mass", source: estimated("Typical alkaline 9 V batteries: about 45 g", "medium") },
  ],
  generate: ({ snap }) => {
    const b = new BodyBuilder()
    const body = PP3.height - TERMINAL.height
    const outline = roundedRect(PP3.width, PP3.depth, 1.5, 4)
    extrude(b, outline, [], 0, body)
    let volume = outlineArea(outline) * body
    const plus = circleAt([PP3.spacing / 2, 0], TERMINAL.plus / 2, 16)
    const minus = shifted(hexagon(TERMINAL.minus), -PP3.spacing / 2, 0)
    for (const t of [plus, minus]) {
      extrude(b, t, [], body - 0.5, PP3.height, 1)
      volume += outlineArea(t) * (TERMINAL.height + 0.5)
    }
    const anchors: Record<string, GeneratedAnchor> = {
      base: axialY("battery", "Base", 0, false, { kind: "planar", role: "placement" }),
      plus: {
        ...terminal("Positive terminal", PP3.spacing / 2, PP3.height),
        interface: "pp3-terminal",
      },
      minus: {
        ...terminal("Negative terminal", -PP3.spacing / 2, PP3.height),
        interface: "pp3-terminal",
      },
    }
    if (snap) {
      const housing = roundedRect(SNAP.width, SNAP.depth, 2, 4)
      const y0 = PP3.height - 0.5
      extrude(b, housing, [], y0, y0 + SNAP.height, 2)
      volume += outlineArea(housing) * SNAP.height
      const top = y0 + SNAP.height
      anchors.red = { ...terminal("Red lead (+)", PP3.spacing / 2, top), role: "port" }
      anchors.black = { ...terminal("Black lead (−)", -PP3.spacing / 2, top), role: "port" }
    }
    return {
      name: snap ? "9 V battery with snap" : "9 V battery",
      tags: snap ? ["snap"] : [],
      bodies: {
        battery: {
          name: "9 V battery",
          mesh: b.build(),
          material: "wrapper",
          slots: [
            { name: "Wrapper", material: "wrapper" },
            { name: "Terminals", material: "metal" },
            ...(snap ? [{ name: "Snap", material: "snap" }] : []),
          ],
          collider: "box",
          role: "body",
          volumeMm3: volume,
          mass: {
            kg: 0.045,
            source: estimated("Typical alkaline 9 V batteries: about 45 g", "medium"),
          },
        },
      },
      rootBody: "battery",
      materials: {
        wrapper: tinted("std.abs", "9 V wrapper", "#a8814a", 1380),
        metal: builtin("std.steel"),
        snap: tinted("std.abs", "Snap housing", "#1f1f1f", 1200),
      },
      anchors,
      mates: {},
      suggestedMates: [],
      placement: { anchor: "base", groundIfFirst: false },
      values: {
        voltage: { value: 9, unit: "V", source: estimated("Alkaline 9 V nominal", "high") },
      },
    }
  },
})

function terminal(name: string, u: number, y: number): GeneratedAnchor {
  return {
    body: "battery",
    name,
    kind: "axial",
    frame: frameAt(at([u, 0], y), [0, 1, 0], [1, 0, 0]),
    role: "port",
  }
}
