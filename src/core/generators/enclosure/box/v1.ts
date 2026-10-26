import { z } from "zod"
import { builtin, frameAt, mm } from "../../common"
import { BodyBuilder } from "../../mesh/builder"
import { outlineArea, roundedRect, type Outline } from "../../mesh/outline"
import { cap } from "../../mesh/planar"
import { wall } from "../../mesh/prism"
import { defineGenerator, type GeneratedAnchor } from "../../types"

const Params = z
  .object({
    /** Outside dimensions. */
    widthMm: z.number().min(10).max(1000),
    depthMm: z.number().min(10).max(1000),
    heightMm: z.number().min(5).max(1000),
    wallMm: z.number().min(0.8).max(20),
    floorMm: z.number().min(0.8).max(20),
    cornerRadiusMm: z.number().min(0).max(100),
    lid: z.boolean(),
    material: z.enum(["pla", "abs", "aluminium"]),
  })
  .strict()
  .refine((p) => 2 * p.wallMm + 6 < Math.min(p.widthMm, p.depthMm), {
    message: "walls too thick",
    path: ["wallMm"],
  })
  .refine((p) => p.floorMm + 2 < p.heightMm, { message: "floor too thick", path: ["floorMm"] })
  .refine((p) => p.cornerRadiusMm < Math.min(p.widthMm, p.depthMm) / 2, {
    message: "corner radius too large",
    path: ["cornerRadiusMm"],
  })

const MATERIALS = { pla: "std.pla", abs: "std.abs", aluminium: "std.aluminium-6061" } as const
const LID = { thickness: 2, lip: 3, lipWall: 1.2, clearance: 0.2 } as const

/** A rounded-rectangle outline inset by `by` (the corner radius shrinks with it). */
const inset = (w: number, d: number, r: number, by: number): Outline =>
  roundedRect(w - 2 * by, d - 2 * by, Math.max(0, r - by), 6)

/** An open box standing on the XZ plane, with an optional lid that drops in by a lip. */
export const enclosureBox = defineGenerator({
  id: "enclosure.box",
  major: 1,
  version: "1.0.0",
  name: "Enclosure box",
  summary: "Rounded project box with walls, floor and an optional lid",
  category: ["mechanical", "enclosures"],
  tags: ["enclosure", "box", "case", "housing", "project box"],
  params: Params,
  defaults: {
    widthMm: 100,
    depthMm: 60,
    heightMm: 40,
    wallMm: 2,
    floorMm: 2,
    cornerRadiusMm: 4,
    lid: true,
    material: "pla",
  },
  presets: [
    {
      key: "small",
      name: "60 × 40 × 25 with lid",
      params: {
        widthMm: 60,
        depthMm: 40,
        heightMm: 25,
        wallMm: 2,
        floorMm: 2,
        cornerRadiusMm: 3,
        lid: true,
        material: "pla",
      },
    },
    {
      key: "medium",
      name: "100 × 60 × 40 with lid",
      params: {
        widthMm: 100,
        depthMm: 60,
        heightMm: 40,
        wallMm: 2,
        floorMm: 2,
        cornerRadiusMm: 4,
        lid: true,
        material: "pla",
      },
    },
    {
      key: "tray",
      name: "150 × 100 × 30 tray, square",
      params: {
        widthMm: 150,
        depthMm: 100,
        heightMm: 30,
        wallMm: 3,
        floorMm: 3,
        cornerRadiusMm: 0,
        lid: false,
        material: "abs",
      },
    },
  ],
  sources: [],
  generate: (p) => {
    const { widthMm: W, depthMm: D, heightMm: H, wallMm: t, floorMm: f, cornerRadiusMm: r } = p
    const outer = inset(W, D, r, 0)
    const inner = inset(W, D, r, t)
    const box = new BodyBuilder()
    wall(box, outer, 0, outer, H, true)
    cap(box, 0, outer, [], false)
    cap(box, H, outer, [inner], true)
    wall(box, inner, f, inner, H, false)
    cap(box, f, inner, [], true)
    const boxVolume = outlineArea(outer) * H - outlineArea(inner) * (H - f)
    const plane = (
      body: string,
      name: string,
      y: number,
      up: boolean,
      extra = {}
    ): GeneratedAnchor => ({
      body,
      name,
      kind: "planar",
      frame: frameAt([0, y, 0], [0, up ? 1 : -1, 0], [1, 0, 0]),
      ...extra,
    })
    const tag = `lid-${mm(W)}x${mm(D)}`
    const bodies: Record<string, ReturnType<typeof bodyOf>> = {
      box: bodyOf("Box", box, boxVolume),
    }
    const anchors: Record<string, GeneratedAnchor> = {
      bottom: plane("box", "Bottom", 0, false, { role: "placement" }),
      floor: plane("box", "Floor", f, true, { role: "mount" }),
      rim: plane("box", "Rim", H, true, { interface: tag, role: "mate" }),
    }
    if (p.lid) {
      const lipOuter = inset(W, D, r, t + LID.clearance)
      const lipInner = inset(W, D, r, t + LID.clearance + LID.lipWall)
      const [top, low] = [H + LID.thickness, H - LID.lip]
      const lid = new BodyBuilder()
      wall(lid, outer, H, outer, top, true)
      cap(lid, top, outer, [], true)
      cap(lid, H, outer, [lipOuter], false)
      wall(lid, lipOuter, low, lipOuter, H, true)
      cap(lid, low, lipOuter, [lipInner], false)
      wall(lid, lipInner, low, lipInner, H, false)
      cap(lid, H, lipInner, [], false)
      const lidVolume =
        outlineArea(outer) * LID.thickness +
        (outlineArea(lipOuter) - outlineArea(lipInner)) * LID.lip
      bodies.lid = bodyOf("Lid", lid, lidVolume)
      anchors.lidSeat = plane("lid", "Lid seat", H, false, { interface: tag, role: "mate" })
      anchors.lidTop = plane("lid", "Lid top", top, true, { role: "mount" })
    }
    return {
      name: `Enclosure ${mm(W)} × ${mm(D)} × ${mm(H)}${p.lid ? " with lid" : ""}`,
      bodies,
      rootBody: "box",
      materials: { shell: builtin(MATERIALS[p.material]) },
      anchors,
      mates: {},
      suggestedMates: [],
      placement: { anchor: "bottom", groundIfFirst: true },
    }
  },
})

function bodyOf(name: string, b: BodyBuilder, volumeMm3: number) {
  return {
    name,
    mesh: b.build(),
    material: "shell",
    collider: "decomposed" as const,
    role: "body" as const,
    volumeMm3,
  }
}
