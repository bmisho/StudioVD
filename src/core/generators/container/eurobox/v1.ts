import { z } from "zod"
import { computed, estimated, frameAt, mm, standard } from "../../common"
import { tinted } from "../../materials"
import { BodyBuilder } from "../../mesh/builder"
import { outlineArea, roundedRect, type Outline } from "../../mesh/outline"
import { cap } from "../../mesh/planar"
import { wall } from "../../mesh/prism"
import { defineGenerator, type GeneratedAnchor, type GeneratorPreset } from "../../types"
import { FOOTPRINTS, FOOTPRINT_DATA, RIM_WIDTH_MM } from "./sizes"

// Modelled, not measured (estimated): straight 2.5 mm walls, a rim with a skirt round a channel,
// a 3 mm floor over a recess in the underside, a ledge where the foot meets the body inside;
// no handle openings or ribs. Its mass comes out near the listed weight (see the test).
const WALL_MM = 2.5
const PLATE_MM = 3
const RIM_HEIGHT_MM = 15
/** Gap between a stacked box's foot and the opening it stands in. */
const FOOT_CLEARANCE_MM = 2
const CORNER_MM = 24
const SEGMENTS = 6

const Params = z
  .object({
    size: z.enum(FOOTPRINTS),
    // 60 mm clears the deepest foot (22), the ledge over it (3) and the rim (15).
    heightMm: z.number().min(60).max(600),
  })
  .strict()

/** The footprint's outline inset by `by` (corners keep their centres). */
const inset = (L: number, W: number, by: number): Outline =>
  roundedRect(L - 2 * by, W - 2 * by, CORNER_MM - by, SEGMENTS)

const presets: GeneratorPreset[] = FOOTPRINTS.flatMap((size) => {
  const d = FOOTPRINT_DATA[size]
  return d.heightsMm.map((heightMm) => ({
    key: `s${size}x${heightMm}`,
    name: `${d.lengthMm} × ${d.widthMm} × ${heightMm}`,
    params: { size, heightMm },
  }))
})

/**
 * A Euro stacking container (0.2.1): rim at the full footprint, straight walls, a stacking foot
 * that stands in the opening of the box below (its shoulder on that box's rim). Origin at the middle of the footprint, on the ground; Y up, length along X.
 */
export const containerEurobox = defineGenerator({
  id: "container.eurobox",
  major: 1,
  version: "1.0.0",
  name: "Eurobox",
  summary: "Euro stacking container, 200 × 150 to 800 × 600, closed walls",
  category: ["mechanical", "containers"],
  tags: ["eurobox", "euro container", "stacking box", "crate", "tote", "storage", "bin"],
  params: Params,
  defaults: { size: "600x400", heightMm: 220 },
  presets,
  sources: [
    {
      what: "Footprints and heights",
      source: standard(
        "Euro module footprints on the 600 × 400 base; heights of the Auer EG range from retailer listings and Weidinger datasheets (2026-11)",
        "medium"
      ),
    },
    {
      what: "Opening, floor and stacking depth",
      source: standard(
        "Outer minus listed inner size (15 mm rim, 5 mm floor; 15 mm at 800 × 600); listed usable height in a stack (foot 22 mm, 10 mm on the small boxes)",
        "low"
      ),
    },
    {
      what: "Walls, rim height, corners, draft",
      source: estimated(
        "2.5 mm walls, 3 mm floor and rim top, 15 mm rim with a skirt, R24 corners, no handles"
      ),
    },
    {
      what: "Material",
      source: estimated(
        "Polypropylene, 905 kg/m³ (PP homopolymers 0.90-0.91 g/cm³, ISO 1183 typical)",
        "medium"
      ),
    },
    { what: "Volume", source: computed("Exact for the modelled solid (prisms, band by band)") },
  ],
  generate: (p) => {
    const d = FOOTPRINT_DATA[p.size]
    const [L, W, H] = [d.lengthMm, d.widthMm, p.heightMm]
    const [F, fl, R] = [d.footMm, d.floorMm, RIM_HEIGHT_MM]
    const rim = inset(L, W, 0)
    const skirt = inset(L, W, WALL_MM)
    const body = inset(L, W, RIM_WIDTH_MM - WALL_MM)
    const opening = inset(L, W, RIM_WIDTH_MM)
    const foot = inset(L, W, RIM_WIDTH_MM + FOOT_CLEARANCE_MM)
    const lower = inset(L, W, RIM_WIDTH_MM + FOOT_CLEARANCE_MM + WALL_MM)
    const [recessTop, ledge, channelTop] = [fl - PLATE_MM, F + PLATE_MM, H - PLATE_MM]

    const b = new BodyBuilder()
    cap(b, 0, foot, [lower], false) // the foot's ring the box stands on
    wall(b, lower, 0, lower, recessTop, false) // the recess under the floor
    cap(b, recessTop, lower, [], false)
    wall(b, foot, 0, foot, F, true)
    cap(b, F, body, [foot], false) // the shoulder that rests on the box below
    wall(b, body, F, body, channelTop, true)
    cap(b, channelTop, skirt, [body], false) // the channel under the rim
    wall(b, skirt, H - R, skirt, channelTop, false)
    cap(b, H - R, rim, [skirt], false) // the skirt's edge
    wall(b, rim, H - R, rim, H, true)
    cap(b, H, rim, [opening], true) // rim top
    wall(b, opening, ledge, opening, H, false)
    cap(b, ledge, opening, [lower], true) // the ledge inside, over the foot
    wall(b, lower, fl, lower, ledge, false)
    cap(b, fl, lower, [], true) // floor

    // Solid cross-section in each band of height: what is inside the outside, less the holes.
    const A = outlineArea
    const bands: [number, number][] = [
      [recessTop, A(foot) - A(lower)],
      [PLATE_MM, A(foot)],
      [F - fl, A(foot) - A(lower)],
      [PLATE_MM, A(body) - A(lower)],
      [H - R - ledge, A(body) - A(opening)],
      [channelTop - (H - R), A(rim) - A(skirt) + A(body) - A(opening)],
      [PLATE_MM, A(rim) - A(opening)],
    ]
    const volumeMm3 = bands.reduce((sum, [h, area]) => sum + h * area, 0)
    const tag = `eurobox-${p.size}`
    const plane = (name: string, y: number, up: boolean, extra = {}): GeneratedAnchor => ({
      body: "box",
      name,
      kind: "planar",
      frame: frameAt([0, y, 0], [0, up ? 1 : -1, 0], [1, 0, 0]),
      ...extra,
    })
    return {
      name: `Eurobox ${mm(L)} × ${mm(W)} × ${mm(H)}`,
      bodies: {
        box: {
          name: "Box",
          mesh: b.build(),
          material: "shell",
          collider: "decomposed",
          role: "body",
          volumeMm3,
        },
      },
      rootBody: "box",
      materials: { shell: tinted("std.abs", "Polypropylene (grey)", "#9aa1a8", 905) },
      anchors: {
        bottom: plane("Bottom", 0, false, { role: "placement" }),
        floor: plane("Floor", fl, true, { role: "mount" }),
        rim: plane("Rim", H, true, { interface: tag, role: "mate" }),
        seat: plane("Stacking seat", F, false, { interface: tag, role: "mate" }),
      },
      mates: {},
      suggestedMates: [],
      placement: { anchor: "bottom", groundIfFirst: true },
    }
  },
})
