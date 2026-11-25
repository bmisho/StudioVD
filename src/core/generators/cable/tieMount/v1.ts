import { z } from "zod"
import { estimated, mm } from "../../common"
import { axialY } from "../../control/parts"
import { tinted } from "../../materials"
import { BodyBuilder } from "../../mesh/builder"
import { rectangle } from "../../mesh/outline"
import { extrude } from "../../mesh/prism"
import { defineGenerator } from "../../types"
import { bundleAnchor, strapWidth, zipTie } from "../strap"

const PLATE_MM = 1.6
const BRIDGE_MM = 3

const Params = z
  .object({
    bundleMm: z.number().min(1).max(30),
    baseMm: z.number().min(10).max(40),
    strapMm: z.number().min(0.6).max(2),
  })
  .strict()
  .refine((p) => strapWidth(p.strapMm) + 4 < p.baseMm, "the base must be wider than the tie")

/**
 * A stick-on zip tie mount with its tie closed round a bundle (0.2.2): a square adhesive
 * base on a surface (y = 0), a bridge the tie runs under, and the tie round the cables lying
 * on it, its head on the side. "Cable through" is a waypoint for every cable in the bundle;
 * size the tie to them (Properties offers that for a tie the cables already run through).
 */
export const cableTieMount = defineGenerator({
  id: "cable.tieMount",
  major: 1,
  version: "1.0.0",
  name: "Zip tie on a mount",
  summary: "Adhesive zip tie mount with its tie round a bundle: a waypoint for cables",
  category: ["electrical", "cable-management"],
  tags: ["zip tie", "cable tie", "tie mount", "adhesive", "bundle", "wiring"],
  params: Params,
  defaults: { bundleMm: 5, baseMm: 19, strapMm: 1.2 },
  presets: [
    {
      key: "m13",
      name: "Zip tie on a 13 mm mount",
      params: { bundleMm: 3, baseMm: 13, strapMm: 0.9 },
    },
    {
      key: "m19",
      name: "Zip tie on a 19 mm mount",
      params: { bundleMm: 5, baseMm: 19, strapMm: 1.2 },
    },
    {
      key: "m28",
      name: "Zip tie on a 28 mm mount",
      params: { bundleMm: 10, baseMm: 28, strapMm: 1.4 },
    },
  ],
  sources: [
    {
      what: "Mount sizes",
      source: estimated(
        "Common adhesive tie mounts are 13, 19, 25 and 28 mm square; plate and bridge heights visual",
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
    extrude(b, rectangle(p.baseMm, p.baseMm), [], 0, PLATE_MM)
    // The bridge across the cable's run, as wide as the tie plus its walls.
    const bridgeX = strapWidth(p.strapMm) + 2
    const bridgeZ = p.baseMm * 0.6
    extrude(b, rectangle(bridgeX, bridgeZ), [], PLATE_MM, PLATE_MM + BRIDGE_MM)
    let volume = p.baseMm * p.baseMm * PLATE_MM + bridgeX * bridgeZ * BRIDGE_MM
    // The bundle lies on the bridge; the tie's lowest run goes through it.
    const cy = PLATE_MM + BRIDGE_MM + p.bundleMm / 2
    volume += zipTie(b, cy, p.bundleMm, p.strapMm, "side", 1)
    return {
      name: `Zip tie on a ${mm(p.baseMm)} mm mount, Ø${mm(p.bundleMm)} mm`,
      tags: [`${mm(p.bundleMm)}mm`],
      bodies: {
        mount: {
          name: "Tie mount",
          mesh: b.build(),
          material: "mount",
          slots: [
            { name: "Mount", material: "mount" },
            { name: "Tie", material: "tie" },
          ],
          collider: "hull",
          role: "fastener",
          volumeMm3: volume,
        },
      },
      rootBody: "mount",
      materials: {
        mount: tinted("std.abs", "Natural nylon", "#eeeae0", 1140),
        tie: tinted("std.abs", "Black nylon", "#1f1f1f", 1140),
      },
      anchors: {
        base: axialY("mount", "Base", 0, false, { kind: "planar", role: "placement" }),
        cable: bundleAnchor("mount", cy, p.bundleMm),
      },
      mates: {},
      suggestedMates: [{ anchor: "base", mateType: "fixed", flip: true, label: "On a wall" }],
      placement: { anchor: "base", groundIfFirst: false },
    }
  },
})
