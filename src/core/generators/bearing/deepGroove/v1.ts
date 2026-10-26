import { z } from "zod"
import { builtin, mm, segmentsFor } from "../../common"
import { toRuns } from "../../fastener/screw/heads"
import { BodyBuilder } from "../../mesh/builder"
import type { Vec2 } from "../../mesh/outline"
import { revolve, revolvedVolume } from "../../mesh/revolve"
import { defineGenerator, type GeneratedAnchor } from "../../types"
import { BEARINGS, BEARING_SOURCES, designationOf } from "./table"

const Params = z
  .object({
    boreMm: z.number().min(1).max(200),
    outerMm: z.number().min(3).max(400),
    widthMm: z.number().min(1).max(100),
    /** 2RS: rubber seals; ZZ: steel shields (both sides). */
    seal: z.enum(["2RS", "ZZ"]),
  })
  .strict()
  .refine((p) => p.outerMm - p.boreMm >= 2, { message: "rings too thin", path: ["outerMm"] })

/** A deep-groove ball bearing lying flat (axis Y): outer ring with its seals, inner ring. */
export const bearingDeepGroove = defineGenerator({
  id: "bearing.deepGroove",
  major: 1,
  version: "1.0.0",
  name: "Ball bearing",
  summary: "Deep-groove ball bearing, sealed or shielded both sides",
  category: ["mechanical", "bearings"],
  tags: ["bearing", "ball bearing", "deep groove"],
  designatorPrefix: "BRG",
  params: Params,
  defaults: { boreMm: 8, outerMm: 22, widthMm: 7, seal: "2RS" },
  presets: BEARINGS.map((b) => ({
    key: `b${b.designation}`,
    name: `${b.designation}-2RS (${b.d} × ${b.D} × ${b.B})`,
    params: { boreMm: b.d, outerMm: b.D, widthMm: b.B, seal: "2RS" },
  })),
  sources: BEARING_SOURCES,
  generate: ({ boreMm: d, outerMm: D, widthMm: B, seal }) => {
    const designation = designationOf(d, D, B)
    const r = BEARINGS.find((x) => x.designation === designation)?.r ?? 0.3
    const c = Math.min(r, B / 8, (D - d) / 16)
    const gap = D - d
    const [ri, rii, rri, ro] = [d / 2, (d + 0.29 * gap) / 2, (D - 0.31 * gap) / 2, D / 2]
    const [e, ts] = [
      Math.min(0.2, B / 20),
      seal === "ZZ" ? Math.min(0.3, B / 12) : Math.min(0.6, B / 8),
    ]
    const rsi = rii + Math.min(0.15, (rri - rii) / 8)
    const n = segmentsFor(ro)
    const ring: Vec2[] = [
      [rri, e],
      [rri, 0],
      [ro - c, 0],
      [ro, c],
      [ro, B - c],
      [ro - c, B],
      [rri, B],
      [rri, B - e],
    ]
    const topShield: Vec2[] = [
      [rri, B - e],
      [rsi, B - e],
      [rsi, B - e - ts],
      [rri, B - e - ts],
    ]
    const bottomShield: Vec2[] = [
      [rri, e + ts],
      [rsi, e + ts],
      [rsi, e],
      [rri, e],
    ]
    const sealSlot = seal === "2RS" ? 1 : 0
    const outer = new BodyBuilder()
    revolve(outer, toRuns(ring), n)
    revolve(outer, toRuns(topShield), n, sealSlot)
    revolve(
      outer,
      [
        [
          [rri, B - e - ts],
          [rri, e + ts],
        ],
      ],
      n
    )
    revolve(outer, toRuns(bottomShield), n, sealSlot)
    const inner = new BodyBuilder()
    const innerRing: Vec2[] = [
      [ri + c, 0],
      [rii, 0],
      [rii, B],
      [ri + c, B],
      [ri, B - c],
      [ri, c],
      [ri + c, 0],
    ]
    revolve(inner, toRuns(innerRing), n)
    const outerVolume = revolvedVolume([
      ...ring,
      ...topShield.slice(1),
      ...bottomShield.slice(0, -1),
    ])
    const axial = (
      body: string,
      name: string,
      y: number,
      up: boolean,
      extra = {}
    ): GeneratedAnchor => ({
      body,
      name,
      kind: "axial",
      frame: { originMm: [0, y, 0], z: [0, up ? 1 : -1, 0], x: [1, 0, 0] },
      ...extra,
    })
    const label = designation ? `${designation}-${seal}` : `${mm(d)} × ${mm(D)} × ${mm(B)}`
    return {
      name: `Ball bearing ${label}`,
      summary: `Deep-groove ball bearing, ${mm(d)} × ${mm(D)} × ${mm(B)} mm, ${seal === "2RS" ? "sealed" : "shielded"} both sides`,
      tags: designation ? [designation, seal.toLowerCase()] : [seal.toLowerCase()],
      bodies: {
        outer: {
          name: "Outer ring",
          mesh: outer.build(),
          material: "steel",
          ...(seal === "2RS" && {
            slots: [
              { name: "Ring", material: "steel" },
              { name: "Seals", material: "rubber" },
            ],
          }),
          collider: "decomposed",
          role: "body",
          volumeMm3: outerVolume,
        },
        inner: {
          name: "Inner ring",
          mesh: inner.build(),
          material: "steel",
          collider: "decomposed",
          role: "moving",
          volumeMm3: revolvedVolume(innerRing.slice(0, -1)),
        },
      },
      rootBody: "outer",
      materials: {
        steel: builtin("std.steel"),
        ...(seal === "2RS" && { rubber: builtin("std.rubber") }),
      },
      anchors: {
        outerAxis: axial("outer", "Outer axis", B / 2, true),
        innerAxis: axial("inner", "Inner axis", B / 2, true),
        bore: axial("inner", "Bore", B, true, { interface: `bore-${mm(d)}mm`, role: "mate" }),
        boreBack: axial("inner", "Bore, back", 0, false, { interface: `bore-${mm(d)}mm` }),
        seat: axial("outer", "Outer ring", 0, false, {
          interface: `boss-${mm(D)}mm`,
          role: "mount",
        }),
        face: {
          body: "outer",
          name: "Face",
          kind: "planar",
          frame: { originMm: [0, 0, 0], z: [0, -1, 0], x: [1, 0, 0] },
          role: "placement",
        },
      },
      mates: {
        spin: {
          name: "Rings turn",
          type: "revolute",
          anchorA: "outerAxis",
          anchorB: "innerAxis",
          flip: false,
          angleOffsetRad: 0,
          contactsEnabled: false,
        },
      },
      suggestedMates: [
        { anchor: "bore", mateType: "revolute", flip: false, label: `On a ${mm(d)} mm shaft` },
        { anchor: "seat", mateType: "fixed", flip: true, label: `In a ${mm(D)} mm bore` },
      ],
      placement: { anchor: "face", groundIfFirst: false },
    }
  },
})
