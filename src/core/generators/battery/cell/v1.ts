import { z } from "zod"
import { builtin, estimated, frameAt, segmentsFor } from "../../common"
import { toRuns } from "../../fastener/screw/heads"
import { tinted } from "../../materials"
import { BodyBuilder } from "../../mesh/builder"
import type { Vec2 } from "../../mesh/outline"
import { revolve, revolvedVolume } from "../../mesh/revolve"
import { defineGenerator, type GeneratedAnchor } from "../../types"
import { CELLS } from "./table"

const Params = z.object({ size: z.enum(["18650", "21700", "AA", "AAA"]) }).strict()

/** A cylindrical cell standing on its negative end (axis Y), positive terminal up. */
export const batteryCell = defineGenerator({
  id: "battery.cell",
  major: 1,
  version: "1.0.0",
  name: "Battery cell",
  summary: "Cylindrical cell: 18650, 21700, AA or AAA",
  category: ["electrical", "batteries"],
  tags: ["battery", "cell", "18650", "21700", "aa", "aaa"],
  designatorPrefix: "BT",
  params: Params,
  defaults: { size: "18650" },
  presets: (["18650", "21700", "AA", "AAA"] as const).map((size) => ({
    key: `c${size}`,
    name: CELLS[size].name,
    params: { size },
  })),
  sources: [
    ...Object.values(CELLS).map((c) => ({ what: c.name, source: c.sizeSource })),
    {
      what: "Wrapper density",
      source: estimated("PVC 1.38 g/cm³; unused: the cell's mass applies", "medium"),
    },
  ],
  generate: ({ size }) => {
    const c = CELLS[size]
    const [R, rn] = [c.diameter / 2, c.nub.diameter / 2]
    const body = c.height - c.nub.height
    const e = Math.min(0.8, R / 8)
    // Wrapper round the side and over both edges; bare metal on the ends and the terminal.
    const ends: Vec2[] = [
      [0, 0],
      [R - e, 0],
    ]
    const side: Vec2[] = [
      [R - e, 0],
      [R, e],
      [R, body - e],
      [R - e, body],
    ]
    const top: Vec2[] = [
      [R - e, body],
      [rn, body],
      [rn, c.height],
      [0, c.height],
    ]
    const n = segmentsFor(R)
    const b = new BodyBuilder()
    revolve(b, toRuns(ends), n, 1)
    revolve(b, toRuns(side), n, 0)
    revolve(b, toRuns(top), n, 1)
    const volume = revolvedVolume([[0, 0], [R - e, 0], ...side.slice(1), ...top.slice(1)])
    const axial = (name: string, y: number, up: boolean, extra = {}): GeneratedAnchor => ({
      body: "cell",
      name,
      kind: "axial",
      frame: frameAt([0, y, 0], [0, up ? 1 : -1, 0], [1, 0, 0]),
      ...extra,
    })
    return {
      name: c.name,
      summary: `${c.chemistry}, ${c.volts} V nominal, Ø${c.diameter} × ${c.height} mm`,
      tags: [size.toLowerCase(), c.chemistry.toLowerCase()],
      bodies: {
        cell: {
          name: c.name,
          mesh: b.build(),
          material: "wrapper",
          slots: [
            { name: "Wrapper", material: "wrapper" },
            { name: "Terminals", material: "metal" },
          ],
          collider: "hull",
          role: "body",
          volumeMm3: volume,
          mass: { kg: c.massKg, source: c.massSource },
        },
      },
      rootBody: "cell",
      materials: {
        wrapper: tinted("std.abs", `${size} wrapper`, c.wrapper, 1380),
        metal: builtin("std.steel"),
      },
      anchors: {
        plus: axial("Positive terminal", c.height, true, { role: "port" }),
        minus: axial("Negative terminal", 0, false, { role: "port" }),
        axis: axial("Axis", c.height / 2, true, {
          interface: `cell-${size.toLowerCase()}`,
          role: "mate",
        }),
      },
      mates: {},
      suggestedMates: [],
      placement: { anchor: "minus", groundIfFirst: false },
      values: {
        voltage: {
          value: c.volts,
          unit: "V",
          source: estimated(`${c.chemistry} nominal voltage`, "high"),
        },
      },
    }
  },
})
