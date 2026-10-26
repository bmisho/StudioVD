import { z } from "zod"
import type { Vec3 } from "@/core/schema"
import { builtin, estimated, frameAt } from "../../common"
import { BodyBuilder } from "../../mesh/builder"
import { outlineArea, polygon, ringPoint, type Vec2 } from "../../mesh/outline"
import { planarFace } from "../../mesh/planar"
import { loopWall } from "../../mesh/prism"
import { ngonFraction } from "../../mesh/revolve"
import { defineGenerator, type GeneratedAnchor } from "../../types"

/** The fillet inside the corner. */
const filletOf = (L: number, t: number) => Math.min(3, (L - t) / 4)
/** Half the length of a leg's free face, beside the fillet (room for a hole). */
const freeHalf = (L: number, t: number) => (L - t) / 2 - filletOf(L, t)

const Params = z
  .object({
    /** Leg length and width (20 for 2020 profiles). */
    sizeMm: z.number().min(10).max(80),
    thicknessMm: z.number().min(1.5).max(10),
    holeMm: z.number().min(2).max(12),
  })
  .strict()
  .refine((p) => p.holeMm / 2 < freeHalf(p.sizeMm, p.thicknessMm) - 0.5, {
    message: "hole too large for the legs",
    path: ["holeMm"],
  })

/**
 * An L bracket: a horizontal leg along +Z (bottom face on y = 0) and a vertical leg up +Y
 * (back face on z = 0), `size` wide along X, a 45° fillet inside the corner and a hole
 * through the middle of each leg's free part.
 */
export const frameCornerBracket = defineGenerator({
  id: "frame.cornerBracket",
  major: 1,
  version: "1.0.0",
  name: "Corner bracket",
  summary: "L bracket for T-slot frames (2020 by default)",
  category: ["mechanical", "frame"],
  tags: ["bracket", "corner bracket", "angle", "2020"],
  params: Params,
  defaults: { sizeMm: 20, thicknessMm: 4, holeMm: 5.5 },
  presets: [
    {
      key: "b2020",
      name: "2020 corner bracket",
      params: { sizeMm: 20, thicknessMm: 4, holeMm: 5.5 },
    },
    {
      key: "b4040",
      name: "4040 corner bracket",
      params: { sizeMm: 40, thicknessMm: 5, holeMm: 8.5 },
    },
  ],
  sources: [
    {
      what: "Shape",
      source: estimated(
        "Simplified cast 2020 bracket: plain legs, M5 clearance holes, no gusset",
        "low"
      ),
    },
  ],
  generate: ({ sizeMm: L, thicknessMm: t, holeMm }) => {
    const [w, c, r] = [L / 2, filletOf(L, t), holeMm / 2]
    const hc = (t + L) / 2 // hole centres along each leg
    // The L profile in (z, y), counter-clockwise seen from +X.
    const profile: Vec2[] = [
      [0, 0],
      [L, 0],
      [L, t],
      [t + c, t],
      [t, t + c],
      [t, L],
      [0, L],
    ]
    const P = (x: number, [z, y]: Vec2): Vec3 => [x, y, z]
    const n = 24
    const ring = (fn: (cu: number, cv: number) => Vec3) =>
      Array.from({ length: n }, (_, j) => {
        const [cu, cv] = ringPoint(r, j, n)
        return fn(cu, cv)
      })
    const holeBottom = ring((cu, cv) => [cu, 0, hc + cv]) // through the horizontal leg
    const holeTop = ring((cu, cv) => [cu, t, hc + cv])
    const holeBack = ring((cu, cv) => [cu, hc + cv, 0]) // through the vertical leg
    const holeFront = ring((cu, cv) => [cu, hc + cv, t])
    const b = new BodyBuilder()
    planarFace(b, [profile.map((p) => P(w, p))], [1, 0, 0])
    planarFace(b, [profile.map((p) => P(-w, p))], [-1, 0, 0])
    // Each side of the profile swept across the width, facing out; four carry a hole.
    const sides: { normal: Vec3; hole?: Vec3[] }[] = [
      { normal: [0, -1, 0], hole: holeBottom },
      { normal: [0, 0, 1] },
      { normal: [0, 1, 0], hole: holeTop },
      { normal: [0, Math.SQRT1_2, Math.SQRT1_2] },
      { normal: [0, 0, 1], hole: holeFront },
      { normal: [0, 1, 0] },
      { normal: [0, 0, -1], hole: holeBack },
    ]
    profile.forEach((p, i) => {
      const q = profile[(i + 1) % profile.length] ?? p
      const rect = [P(-w, p), P(w, p), P(w, q), P(-w, q)]
      const side = sides[i]
      if (side) planarFace(b, side.hole ? [rect, side.hole] : [rect], side.normal)
    })
    loopWall(b, holeBottom, holeTop, false)
    loopWall(b, holeBack, holeFront, false)
    const volume = outlineArea(polygon(profile)) * L - 2 * ngonFraction(n) * Math.PI * r * r * t
    const face = (name: string, origin: Vec3, z: Vec3): GeneratedAnchor => ({
      body: "bracket",
      name,
      kind: "planar",
      frame: frameAt(origin, z, [1, 0, 0]),
      interface: "rail-2020",
      role: "mount",
    })
    const hole = (name: string, origin: Vec3, z: Vec3): GeneratedAnchor => ({
      body: "bracket",
      name,
      kind: "axial",
      frame: frameAt(origin, z, [1, 0, 0]),
      interface: `M${Math.floor(holeMm - 0.4)}-hole`,
    })
    return {
      name: `Corner bracket ${L} × ${L}`,
      bodies: {
        bracket: {
          name: "Bracket",
          mesh: b.build(),
          material: "alu",
          collider: "decomposed",
          volumeMm3: volume,
        },
      },
      rootBody: "bracket",
      materials: { alu: builtin("std.aluminium-6061") },
      anchors: {
        faceA: { ...face("Bottom face", [0, 0, hc], [0, -1, 0]), role: "placement" },
        faceB: face("Back face", [0, hc, 0], [0, 0, -1]),
        holeA: hole("Bottom hole", [0, 0, hc], [0, -1, 0]),
        holeB: hole("Back hole", [0, hc, 0], [0, 0, -1]),
      },
      mates: {},
      suggestedMates: [],
      placement: { anchor: "faceA", groundIfFirst: false },
    }
  },
})
