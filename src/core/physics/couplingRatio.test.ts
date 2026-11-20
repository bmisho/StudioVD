import { describe, expect, it } from "vitest"
import { anchor, mate, part } from "@/core/assembly/testing/mateFixtures"
import { instantiateComponent } from "@/core/library/instantiate"
import { at, generated } from "@/core/library/testing/generatedComponent"
import { mergeBatch } from "@/core/scene/entityBatch"
import {
  createEmptyDocument,
  type Anchor,
  type Mate,
  type Part,
  type SceneDocument,
  type Vec3,
} from "@/core/schema"
import { couplingKinds, suggestRatio } from "./couplingRatio"

const Y: Vec3 = [0, 1, 0]
const spur = (teeth: number) => ({
  moduleMm: 1,
  teeth,
  faceWidthMm: 6,
  boreMm: 5,
  hubDiameterMm: 0,
  hubLengthMm: 0,
  pressureAngleDeg: 20,
  profileShift: "auto",
  material: "pom",
})
const X: Vec3 = [1, 0, 0]

/** Inserts generator `id` at x, returns the document and its first part. */
async function insert(
  doc: SceneDocument,
  id: string,
  params: Record<string, number | string>,
  x: number
) {
  const ready = await generated(id, params)
  const placed = instantiateComponent(doc, { ...ready, pose: at(x, 0, 0) })
  const next = mergeBatch(doc, placed.batch)
  const partId = Object.values(next.components[placed.instance]?.parts ?? {})[0]
  return { doc: next, part: next.parts[partId ?? ("" as never)] as Part }
}

function add(doc: SceneDocument, parts: Part[], anchors: Anchor[], mates: Mate[]): SceneDocument {
  const next = structuredClone(doc)
  for (const p of parts) next.parts[p.id] = p
  for (const a of anchors) next.anchors[a.id] = a
  for (const m of mates) next.mates[m.id] = m
  return next
}

const local = (p: Part, world: Vec3): Vec3 => [
  world[0] - p.pose.positionMm[0],
  world[1] - p.pose.positionMm[1],
  world[2] - p.pose.positionMm[2],
]

describe("coupling ratios from the parts (PLAN 10.5)", () => {
  it("lists the couplings two mate types allow", () => {
    expect(couplingKinds("revolute", "revolute")).toEqual(["gear"])
    expect(couplingKinds("revolute", "prismatic")).toEqual(["rackPinion", "leadScrew"])
    expect(couplingKinds("prismatic", "revolute")).toEqual([])
    expect(couplingKinds("fixed", "revolute")).toEqual([])
  })

  it("meshing spur gears: opposite turns at the ratio of their teeth, signed by each hinge", async () => {
    let doc = createEmptyDocument("0.1.0")
    const small = await insert(doc, "gear.spur", spur(20), 0)
    doc = small.doc
    const big = await insert(doc, "gear.spur", spur(40), 30)
    doc = big.doc
    const base = part("Base", true)
    const [b1, g1] = [
      anchor(base, [0, 0, 0], Y, X),
      anchor(small.part, local(small.part, [0, 0, 0]), Y, X),
    ]
    const [b2, g2] = [
      anchor(base, [30, 0, 0], Y, X),
      anchor(big.part, local(big.part, [30, 0, 0]), Y, X),
    ]
    const [hingeA, hingeB] = [mate(b1, g1, "revolute"), mate(b2, g2, "revolute")]
    doc = add(doc, [base], [b1, g1, b2, g2], [hingeA, hingeB])
    expect(suggestRatio(doc, "gear", hingeA, hingeB)).toBeCloseTo(-0.5, 12)
    // The big gear's hinge written the other way round counts the other way.
    const reversed = mate(g2, b2, "revolute")
    expect(suggestRatio(add(doc, [], [], [reversed]), "gear", hingeA, reversed)).toBeCloseTo(
      0.5,
      12
    )
  })

  it("a lead screw moves its nut lead/2π per radian, back along the screw's axis", async () => {
    let doc = createEmptyDocument("0.1.0")
    const screw = await insert(
      doc,
      "motion.leadScrew",
      { lengthMm: 300, leadMm: 8, thread: "grooved" },
      0
    )
    doc = screw.doc
    const frame = part("Frame", true)
    const nut = part("Nut", false)
    const [f1, s1] = [
      anchor(frame, [0, 0, 0], Y, X),
      anchor(screw.part, local(screw.part, [0, 0, 0]), Y, X),
    ]
    const [f2, n2] = [anchor(frame, [0, 0, 0], Y, X), anchor(nut, [0, 0, 0], Y, X)]
    const [spin, travel] = [mate(f1, s1, "revolute"), mate(f2, n2, "prismatic")]
    doc = add(doc, [frame, nut], [f1, s1, f2, n2], [spin, travel])
    expect(suggestRatio(doc, "leadScrew", spin, travel)).toBeCloseTo(-8 / (2 * Math.PI), 12)
  })

  it("a pinion moves its rack its pitch radius per radian, tangent at the contact", async () => {
    let doc = createEmptyDocument("0.1.0")
    const pinion = await insert(doc, "gear.spur", spur(20), 0)
    doc = pinion.doc
    const frame = part("Frame", true)
    const rack = part("Rack", false, at(0, 0, 10)) // along +X, on the pinion's +Z side
    const Z: Vec3 = [0, 0, 1]
    const [f1, p1] = [
      anchor(frame, [0, 0, 0], Y, X),
      anchor(pinion.part, local(pinion.part, [0, 0, 0]), Y, X),
    ]
    const [f2, r2] = [anchor(frame, [0, 0, 10], X, Z), anchor(rack, [0, 0, 0], X, Z)]
    const [spin, slide] = [mate(f1, p1, "revolute"), mate(f2, r2, "prismatic")]
    doc = add(doc, [frame, rack], [f1, p1, f2, r2], [spin, slide])
    // Turning +Y moves the +Z side of the pinion towards +X: (+Y) × (+Z) = +X.
    expect(suggestRatio(doc, "rackPinion", spin, slide)).toBeCloseTo(10, 12)
  })
})
