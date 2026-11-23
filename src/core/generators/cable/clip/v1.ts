import { z } from "zod"
import { estimated, mm } from "../../common"
import { axialY } from "../../control/parts"
import { tinted } from "../../materials"
import { BodyBuilder } from "../../mesh/builder"
import { rectangle } from "../../mesh/outline"
import { extrude } from "../../mesh/prism"
import { defineGenerator } from "../../types"
import { bundleAnchor, strap } from "../strap"

const BASE = { thickness: 1.2 } as const
const OPEN = (60 * Math.PI) / 180 // the gap at the top the cable is pressed through

const Params = z
  .object({
    bundleMm: z.number().min(1).max(30),
    baseMm: z.number().min(6).max(40),
    wallMm: z.number().min(0.6).max(4),
  })
  .strict()
  .refine((p) => p.baseMm > p.bundleMm / 2, "the base must be wide enough to hold the clip")

/**
 * A stick-on cable clip (PLAN 16.4): a square base on a surface (y = 0) and an open ring the
 * cable snaps into. Its "Cable through" anchor is a cable's waypoint.
 */
export const cableClip = defineGenerator({
  id: "cable.clip",
  major: 1,
  version: "1.0.0",
  name: "Cable clip",
  summary: "Stick-on clip holding a cable or bundle to a wall: a waypoint for cables",
  category: ["electrical", "cable-management"],
  tags: ["cable clip", "clip", "cable", "wiring", "pedal"],
  params: Params,
  defaults: { bundleMm: 4, baseMm: 10, wallMm: 1 },
  presets: [
    { key: "c2", name: "Cable clip for Ø2 mm", params: { bundleMm: 2, baseMm: 8, wallMm: 0.8 } },
    { key: "c4", name: "Cable clip for Ø4 mm", params: { bundleMm: 4, baseMm: 10, wallMm: 1 } },
    { key: "c8", name: "Cable clip for Ø8 mm", params: { bundleMm: 8, baseMm: 14, wallMm: 1.2 } },
  ],
  sources: [
    {
      what: "Clip sizes",
      source: estimated(
        "Visual: an open ring of the bundle's size on a square adhesive base",
        "low"
      ),
    },
    {
      what: "Nylon density",
      source: estimated("Nylon 6/6 about 1.14 g/cm³ (typical published value)", "medium"),
    },
  ],
  generate: (p) => {
    const b = new BodyBuilder()
    extrude(b, rectangle(p.baseMm, p.baseMm), [], 0, BASE.thickness)
    let volume = p.baseMm * p.baseMm * BASE.thickness
    const radius = p.bundleMm / 2 + p.wallMm / 2
    const cy = BASE.thickness + p.bundleMm / 2
    volume += strap(b, cy, radius, p.wallMm, OPEN / 2, 2 * Math.PI - OPEN / 2)
    return {
      name: `Cable clip for Ø${mm(p.bundleMm)} mm`,
      tags: [`${mm(p.bundleMm)}mm`],
      bodies: {
        clip: {
          name: "Clip",
          mesh: b.build(),
          material: "nylon",
          collider: "hull",
          role: "fastener",
          volumeMm3: volume,
        },
      },
      rootBody: "clip",
      materials: { nylon: tinted("std.abs", "Natural nylon", "#eeeae0", 1140) },
      anchors: {
        base: axialY("clip", "Base", 0, false, { kind: "planar", role: "placement" }),
        cable: bundleAnchor("clip", cy, p.bundleMm),
      },
      mates: {},
      suggestedMates: [{ anchor: "base", mateType: "fixed", flip: true, label: "On a wall" }],
      placement: { anchor: "base", groundIfFirst: false },
    }
  },
})
