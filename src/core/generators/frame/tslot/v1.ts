import { z } from "zod"
import { builtin, frameAt, mm } from "../../common"
import { BodyBuilder } from "../../mesh/builder"
import { at, circleAt, outlineArea, polygon } from "../../mesh/outline"
import { extrude } from "../../mesh/prism"
import { defineGenerator, type GeneratedAnchor } from "../../types"
import { TSLOT_BORE, TSLOT_SOURCES, tslotOutline } from "./profile"

const Params = z
  .object({
    profile: z.enum(["2020", "2040", "4040"]),
    lengthMm: z.number().min(5).max(3000),
  })
  .strict()

const CELLS = { "2020": [1, 1], "2040": [2, 1], "4040": [2, 2] } as const

/** An aluminium T-slot extrusion standing on its end (length along Y). */
export const frameTslot = defineGenerator({
  id: "frame.tslot",
  major: 1,
  version: "1.0.0",
  name: "T-slot extrusion",
  summary: "20 mm series aluminium extrusion, 6 mm slots (2020, 2040, 4040)",
  category: ["mechanical", "frame"],
  tags: ["extrusion", "t-slot", "aluminium profile", "2020", "2040", "4040"],
  params: Params,
  defaults: { profile: "2020", lengthMm: 300 },
  presets: [
    { key: "p2020l300", name: "2020, 300 mm", params: { profile: "2020", lengthMm: 300 } },
    { key: "p2020l500", name: "2020, 500 mm", params: { profile: "2020", lengthMm: 500 } },
    { key: "p2040l300", name: "2040, 300 mm", params: { profile: "2040", lengthMm: 300 } },
    { key: "p4040l500", name: "4040, 500 mm", params: { profile: "4040", lengthMm: 500 } },
  ],
  sources: TSLOT_SOURCES,
  generate: ({ profile, lengthMm: L }) => {
    const [cu, cv] = CELLS[profile]
    const { points, slots, cores } = tslotOutline(cu, cv)
    const outline = polygon(points)
    const bores = cores.map((c) => circleAt(c, TSLOT_BORE / 2, 16))
    const b = new BodyBuilder()
    extrude(b, outline, bores, 0, L)
    const volume = (outlineArea(outline) - bores.reduce((s, o) => s + outlineArea(o), 0)) * L
    const anchors: Record<string, GeneratedAnchor> = {
      start: {
        body: "bar",
        name: "Start",
        kind: "planar",
        frame: frameAt([0, 0, 0], [0, -1, 0], [1, 0, 0]),
        role: "placement",
      },
      end: {
        body: "bar",
        name: "End",
        kind: "planar",
        frame: frameAt([0, L, 0], [0, 1, 0], [1, 0, 0]),
        role: "mount",
      },
    }
    slots.forEach((s, k) => {
      const origin = at(s.at, L / 2)
      const normal = at(s.normal, 0)
      anchors[`slot${k + 1}`] = {
        body: "bar",
        name: `Slot ${k + 1}`,
        kind: "planar",
        frame: frameAt(origin, normal, [0, 1, 0]),
        interface: "rail-2020",
        role: "mount",
      }
    })
    cores.forEach((c, k) => {
      for (const [key, y, up] of [
        ["tapStart", 0, false],
        ["tapEnd", L, true],
      ] as const)
        anchors[`${key}${k + 1}`] = {
          body: "bar",
          name: `${key === "tapStart" ? "Start" : "End"} tap ${k + 1}`,
          kind: "axial",
          frame: frameAt(at(c, y), [0, up ? 1 : -1, 0], [1, 0, 0]),
          interface: "M5-hole",
        }
    })
    return {
      name: `Extrusion ${profile}, ${mm(L)} mm`,
      tags: [profile],
      bodies: {
        bar: {
          name: `Extrusion ${profile}`,
          mesh: b.build(),
          material: "alu",
          collider: "hull",
          volumeMm3: volume,
        },
      },
      rootBody: "bar",
      materials: { alu: builtin("std.aluminium-6061") },
      anchors,
      mates: {},
      suggestedMates: [],
      placement: { anchor: "start", groundIfFirst: true },
    }
  },
})
