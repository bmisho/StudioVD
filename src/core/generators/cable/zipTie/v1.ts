import { z } from "zod"
import { estimated, mm } from "../../common"
import { tinted } from "../../materials"
import { BodyBuilder } from "../../mesh/builder"
import { rectangle } from "../../mesh/outline"
import { extrude } from "../../mesh/prism"
import { defineGenerator } from "../../types"
import { bundleAnchor, strap } from "../strap"

const GAP = (12 * Math.PI) / 180 // where the strap enters the head

const Params = z
  .object({
    bundleMm: z.number().min(1).max(60),
    strapMm: z.number().min(0.6).max(3),
  })
  .strict()

/**
 * A zip tie closed round a bundle (PLAN 16.4): its strap round the bundle's centre (the
 * component origin) and its head below. "Cable through" is a cable's waypoint.
 */
export const cableZipTie = defineGenerator({
  id: "cable.zipTie",
  major: 1,
  version: "1.0.0",
  name: "Zip tie",
  summary: "Zip tie round a cable bundle: a waypoint for cables",
  category: ["electrical", "cable-management"],
  tags: ["zip tie", "cable tie", "tie wrap", "bundle", "wiring"],
  params: Params,
  defaults: { bundleMm: 5, strapMm: 1.2 },
  presets: [
    { key: "z3", name: "Zip tie round Ø3 mm", params: { bundleMm: 3, strapMm: 1 } },
    { key: "z6", name: "Zip tie round Ø6 mm", params: { bundleMm: 6, strapMm: 1.2 } },
    { key: "z12", name: "Zip tie round Ø12 mm", params: { bundleMm: 12, strapMm: 1.4 } },
  ],
  sources: [
    {
      what: "Zip tie sizes",
      source: estimated("Visual: a round strap and a head about 4 × 3 × 5 mm", "low"),
    },
    {
      what: "Nylon density",
      source: estimated("Nylon 6/6 about 1.14 g/cm³ (typical published value)", "medium"),
    },
  ],
  generate: (p) => {
    const b = new BodyBuilder()
    const radius = p.bundleMm / 2 + p.strapMm / 2
    // The strap from the head round the bundle and back (angles from +Y; the head is at −Y).
    let volume = strap(b, 0, radius, p.strapMm, Math.PI + GAP / 2, 3 * Math.PI - GAP / 2)
    const head = { w: 4, d: 3, h: 5 }
    const y1 = -radius + p.strapMm
    extrude(b, rectangle(head.d, head.w), [], y1 - head.h, y1)
    volume += head.w * head.d * head.h
    return {
      name: `Zip tie round Ø${mm(p.bundleMm)} mm`,
      tags: [`${mm(p.bundleMm)}mm`],
      bodies: {
        tie: {
          name: "Zip tie",
          mesh: b.build(),
          material: "nylon",
          collider: "hull",
          role: "fastener",
          volumeMm3: volume,
        },
      },
      rootBody: "tie",
      materials: { nylon: tinted("std.abs", "Natural nylon", "#eeeae0", 1140) },
      anchors: { cable: bundleAnchor("tie", 0, p.bundleMm) },
      mates: {},
      suggestedMates: [],
      placement: { anchor: "cable", groundIfFirst: false },
    }
  },
})
