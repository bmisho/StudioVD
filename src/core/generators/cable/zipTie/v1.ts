import { z } from "zod"
import { estimated, mm } from "../../common"
import { tinted } from "../../materials"
import { BodyBuilder } from "../../mesh/builder"
import { defineGenerator } from "../../types"
import { bundleAnchor, zipTie } from "../strap"

const Params = z
  .object({
    bundleMm: z.number().min(1).max(60),
    strapMm: z.number().min(0.6).max(3),
  })
  .strict()

/**
 * A zip tie closed round a bundle (PLAN 16.4): its flat strap round the bundle's centre (the
 * component origin), its head below with the cut tail (1.1: a strap, not a round wire).
 * "Cable through" is a cable's waypoint.
 */
export const cableZipTie = defineGenerator({
  id: "cable.zipTie",
  major: 1,
  version: "1.1.0",
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
      source: estimated(
        "Visual: a flat strap 3 × as wide as thick (1.2 × 3.6 mm), a head about 5 × 3 × 5 mm, a 4 mm tail",
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
    const volume = zipTie(b, 0, p.bundleMm, p.strapMm, "below")
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
