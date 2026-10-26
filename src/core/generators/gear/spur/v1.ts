import { z } from "zod"
import { builtin, computed, estimated, mm, segmentsFor, standard } from "../../common"
import { BodyBuilder } from "../../mesh/builder"
import { circle, outlineArea, smoothRuns } from "../../mesh/outline"
import { cap } from "../../mesh/planar"
import { wall } from "../../mesh/prism"
import { defineGenerator, type GeneratedAnchor } from "../../types"
import { autoShift, spurOutline } from "./involute"

const Params = z
  .object({
    moduleMm: z.number().min(0.3).max(10),
    teeth: z.number().int().min(8).max(200),
    faceWidthMm: z.number().min(0.5).max(200),
    boreMm: z.number().min(0.5).max(500),
    /** A boss on the top face; 0 for none. */
    hubDiameterMm: z.number().min(0).max(500),
    hubLengthMm: z.number().min(0).max(200),
    pressureAngleDeg: z.number().min(14.5).max(25),
    /** Profile shift coefficient, or "auto": (17 − z)/17 below 17 teeth (no undercut). */
    profileShift: z.union([z.literal("auto"), z.number().min(-0.5).max(1)]),
    material: z.enum(["pom", "steel", "brass", "abs", "pla"]),
  })
  .strict()

const MATERIALS = {
  pom: "std.pom",
  steel: "std.steel",
  brass: "std.brass",
  abs: "std.abs",
  pla: "std.pla",
} as const

const gear = (moduleMm: number, teeth: number, boreMm: number) => ({
  moduleMm,
  teeth,
  faceWidthMm: 6,
  boreMm,
  hubDiameterMm: 0,
  hubLengthMm: 0,
  pressureAngleDeg: 20,
  profileShift: "auto" as const,
  material: "pom" as const,
})

/** An involute spur gear lying flat (axis Y), with a bore and an optional hub. */
export const gearSpur = defineGenerator({
  id: "gear.spur",
  major: 1,
  version: "1.0.0",
  name: "Spur gear",
  summary: "Involute spur gear by module and tooth count, profile-shifted below 17 teeth",
  category: ["mechanical", "gears"],
  tags: ["gear", "spur gear", "involute"],
  designatorPrefix: "G",
  params: Params,
  defaults: gear(1, 20, 5),
  presets: [
    { key: "m1z12", name: "Module 1, 12 teeth", params: gear(1, 12, 4) },
    { key: "m1z20", name: "Module 1, 20 teeth", params: gear(1, 20, 5) },
    {
      key: "m1z40",
      name: "Module 1, 40 teeth",
      params: { ...gear(1, 40, 8), hubDiameterMm: 16, hubLengthMm: 5 },
    },
    {
      key: "m05z30",
      name: "Module 0.5, 30 teeth",
      params: { ...gear(0.5, 30, 3), faceWidthMm: 3 },
    },
    { key: "m2z8", name: "Module 2, 8 teeth", params: gear(2, 8, 5) },
  ],
  sources: [
    { what: "Tooth form", source: standard("ISO 53 basic rack (addendum m, dedendum 1.25 m)") },
    { what: "Root fillets", source: estimated("Left out: roots are sharp", "high") },
  ],
  generate: (p) => {
    const { moduleMm: m, teeth: z, faceWidthMm: w, boreMm, material } = p
    const x = p.profileShift === "auto" ? autoShift(z) : p.profileShift
    const g = spurOutline(m, z, p.pressureAngleDeg, x)
    if (boreMm / 2 > g.rf - 0.5 * m) throw new Error("The bore cuts into the teeth.")
    const hub = p.hubDiameterMm > 0 && p.hubLengthMm > 0
    if (hub && (p.hubDiameterMm <= boreMm + 0.5 || p.hubDiameterMm / 2 > g.rf))
      throw new Error("The hub must be wider than the bore and inside the root circle.")
    const teeth = smoothRuns(g.outline, 25)
    const n = segmentsFor(hub ? p.hubDiameterMm / 2 : boreMm * 2)
    const bore = circle(boreMm / 2, n)
    const top = hub ? w + p.hubLengthMm : w
    const b = new BodyBuilder()
    wall(b, teeth, 0, teeth, w, true)
    cap(b, 0, teeth, [bore], false)
    if (hub) {
      const boss = circle(p.hubDiameterMm / 2, n)
      cap(b, w, teeth, [boss], true)
      wall(b, boss, w, boss, top, true)
      cap(b, top, boss, [bore], true)
    } else cap(b, w, teeth, [bore], true)
    wall(b, bore, 0, bore, top, false)
    const boreArea = outlineArea(bore)
    const volume =
      outlineArea(teeth) * w -
      boreArea * top +
      (hub ? outlineArea(circle(p.hubDiameterMm / 2, n)) * p.hubLengthMm : 0)
    const axial = (name: string, y: number, up: boolean, extra = {}): GeneratedAnchor => ({
      body: "gear",
      name,
      kind: "axial",
      frame: { originMm: [0, y, 0], z: [0, up ? 1 : -1, 0], x: [1, 0, 0] },
      ...extra,
    })
    const tag = `gear-m${mm(m)}`
    return {
      name: `Spur gear m${mm(m)} z${z}`,
      summary: `Spur gear, module ${mm(m)}, ${z} teeth, pitch Ø${mm(m * z)} mm`,
      tags: [tag, `${z} teeth`],
      bodies: {
        gear: {
          name: "Gear",
          mesh: b.build(),
          material: "gear",
          collider: "decomposed",
          volumeMm3: volume,
        },
      },
      rootBody: "gear",
      materials: { gear: builtin(MATERIALS[material]) },
      anchors: {
        axis: axial("Pitch plane", w / 2, true, { interface: tag, role: "reference" }),
        bore: axial("Bore", top, true, { interface: `bore-${mm(boreMm)}mm`, role: "mate" }),
        boreBack: axial("Bore, back", 0, false, { interface: `bore-${mm(boreMm)}mm` }),
        face: {
          body: "gear",
          name: "Face",
          kind: "planar",
          frame: { originMm: [0, 0, 0], z: [0, -1, 0], x: [1, 0, 0] },
          role: "placement",
        },
      },
      mates: {},
      suggestedMates: [{ anchor: "bore", mateType: "revolute", flip: false, label: "On a shaft" }],
      placement: { anchor: "face", groundIfFirst: false },
      values: {
        pitchDiameter: { value: m * z, unit: "mm", source: computed("d = m z") },
        tipDiameter: {
          value: 2 * g.ra,
          unit: "mm",
          source: computed("d_a = d + 2m(1 + x), tip shortened if pointed"),
        },
        profileShift: {
          value: x,
          unit: "1",
          source: computed(p.profileShift === "auto" ? "(17 − z)/17 below 17 teeth" : "given"),
        },
      },
    }
  },
})
