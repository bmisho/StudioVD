// @vitest-environment node
import RAPIER from "@dimforge/rapier3d-compat"
import { beforeAll, describe, expect, it } from "vitest"
import { newId, type ConnectorId, type Mate, type Vec3 } from "@/core/schema"
import { mechanism } from "./testing/mechanism"

beforeAll(async () => {
  await RAPIER.init()
})

const X: Vec3 = [1, 0, 0]

/** Two wheels on one grounded base, each on its own hinge about +Z. */
function wheels(distanceMm = 60) {
  const m = mechanism()
  const base = m.box("Base", [100, 5, 5], [30, -40, 0], { grounded: true })
  const a = m.box("Wheel A", [20, 20, 4], [0, 0, 0])
  const b = m.box("Wheel B", [10, 10, 4], [distanceMm, 0, 0])
  const hingeA = m.mate(m.anchor(base, [0, 0, 0]), m.anchor(a, [0, 0, 0]), "revolute")
  const at: Vec3 = [distanceMm, 0, 0]
  const hingeB = m.mate(m.anchor(base, at), m.anchor(b, at), "revolute")
  return { m, base, a, b, hingeA, hingeB }
}

/** Turns wheel A by dragging a point on its rim round `turns` times in `seconds`. */
function crank(
  sim: ReturnType<ReturnType<typeof mechanism>["sim"]>,
  wheel: Parameters<typeof sim.grab>[0],
  turns: number,
  seconds: number,
  each: () => void
) {
  sim.grab(wheel, [18, 0, 0])
  const steps = sim.seconds(seconds)
  sim.step(steps, (i) => {
    const angle = ((i + 1) / steps) * turns * 2 * Math.PI
    sim.moveTo([18 * Math.cos(angle), 18 * Math.sin(angle), 0])
    each()
  })
}

/** The worst the coupling was off while it ran, relative to how far B has travelled. */
function follow(
  ratio: number,
  a: Mate,
  b: Mate,
  sim: ReturnType<ReturnType<typeof mechanism>["sim"]>
) {
  let worst = 0
  return {
    sample: () => {
      const [qa, qb] = [sim.coordinate(a), sim.coordinate(b)]
      worst = Math.max(worst, Math.abs(qb - ratio * qa))
    },
    worst: () => worst,
  }
}

describe("couplings (PLAN 10.5)", () => {
  it("a gear pair keeps its ratio within 1 % while cranked and after release", () => {
    const { m, a, hingeA, hingeB } = wheels()
    m.couple(hingeA, hingeB, "gear", -2) // meshing gears turn opposite ways
    const sim = m.sim(RAPIER)
    const check = follow(-2, hingeA, hingeB, sim)
    crank(sim, a, 3, 4, check.sample)
    sim.release()
    sim.step(sim.seconds(1), check.sample)
    const [qa, qb] = [sim.coordinate(hingeA), sim.coordinate(hingeB)]
    expect(Math.abs(qa)).toBeGreaterThan(5 * Math.PI) // it really turned: almost 3 turns
    expect(qb / qa).toBeCloseTo(-2, 2)
    expect(check.worst()).toBeLessThan(0.01 * Math.abs(qb)) // never 1 % of the travel off
  })

  it("the driven wheel drives back: dragging B turns A", () => {
    const { m, b, hingeA, hingeB } = wheels()
    m.couple(hingeA, hingeB, "gear", -2)
    const sim = m.sim(RAPIER)
    sim.grab(b, [68, 0, 0])
    sim.moveTo([60, 8, 0]) // a quarter turn of B
    sim.step(sim.seconds(2))
    expect(sim.coordinate(hingeB)).toBeCloseTo(Math.PI / 2, 1)
    expect(sim.coordinate(hingeA)).toBeCloseTo(-Math.PI / 4, 1)
  })

  it("rack and pinion: the rack moves the pitch radius per radian", () => {
    const m = mechanism()
    const base = m.box("Base", [100, 5, 5], [0, -40, 0], { grounded: true })
    const pinion = m.box("Pinion", [20, 20, 4], [0, 0, 0])
    // The boxes stand in for teeth: the coupling moves the rack, not their contact.
    const rack = m.box("Rack", [60, 4, 4], [0, 24, 0], { collider: "none" })
    const hinge = m.mate(m.anchor(base, [0, 0, 0]), m.anchor(pinion, [0, 0, 0]), "revolute")
    const slide = m.mate(
      m.anchor(base, [0, 24, 0], X, [0, 1, 0]),
      m.anchor(rack, [0, 24, 0], X, [0, 1, 0]),
      "prismatic"
    )
    m.couple(hinge, slide, "rackPinion", -20) // 20 mm per radian; +θ moves the top rack to −X
    const sim = m.sim(RAPIER)
    const check = follow(-20, hinge, slide, sim)
    crank(sim, pinion, 0.5, 2, check.sample)
    expect(sim.coordinate(hinge)).toBeGreaterThan(3)
    // Still being cranked: within 1 % of the ratio (it closes up once the crank stops).
    expect(Math.abs(sim.coordinate(slide) / sim.coordinate(hinge) + 20)).toBeLessThan(0.2)
    expect(check.worst()).toBeLessThan(0.01 * Math.abs(sim.coordinate(slide)))
    expect(sim.position(rack)[0]).toBeCloseTo(sim.coordinate(slide), 6)
  })

  it("a lead screw: the nut travels the lead per turn, and cannot drive the screw past it", () => {
    const m = mechanism()
    const base = m.box("Base", [100, 5, 5], [0, -40, 0], { grounded: true })
    const screw = m.box("Screw", [80, 4, 4], [0, 0, 0])
    const nut = m.box("Nut", [8, 12, 12], [0, 0, 0], { collider: "none" })
    const spin = m.mate(
      m.anchor(base, [0, 0, 0], X, [0, 1, 0]),
      m.anchor(screw, [0, 0, 0], X, [0, 1, 0]),
      "revolute"
    )
    const travel = m.mate(
      m.anchor(base, [0, 0, 0], X, [0, 1, 0]),
      m.anchor(nut, [0, 0, 0], X, [0, 1, 0]),
      "prismatic"
    )
    const lead = 8 / (2 * Math.PI) // T8: 8 mm per turn
    m.couple(spin, travel, "leadScrew", lead)
    const sim = m.sim(RAPIER)
    sim.grab(nut, [0, 0, 0])
    sim.moveTo([16, 0, 0]) // pull the nut two leads along
    sim.step(sim.seconds(3))
    expect(sim.coordinate(travel)).toBeCloseTo(16, 0)
    expect(sim.coordinate(travel) / sim.coordinate(spin)).toBeCloseTo(lead, 2)
  })

  it("a belt couples its pulleys by their radii, turning the same way", () => {
    const { m, a, b, hingeA, hingeB } = wheels(80)
    const belt = {
      id: newId<ConnectorId>(),
      kind: "belt" as const,
      name: "Belt",
      visible: true,
      materialId: null,
      ends: [
        { anchor: m.anchor(a, [0, 0, 0]).id, radiusMm: 20 },
        { anchor: m.anchor(b, [80, 0, 0]).id, radiusMm: 10 },
      ],
      widthMm: 6,
      thicknessMm: 1.5,
    }
    m.doc.connectors[belt.id] = belt
    const sim = m.sim(RAPIER)
    expect(sim.model.couplings).toEqual([
      { id: `belt:${belt.id}:1`, mateA: hingeA.id, mateB: hingeB.id, ratio: 2 },
    ])
    const check = follow(2, hingeA, hingeB, sim)
    crank(sim, a, 2, 3, check.sample)
    expect(sim.coordinate(hingeB) / sim.coordinate(hingeA)).toBeCloseTo(2, 2)
    expect(check.worst()).toBeLessThan(0.01 * Math.abs(sim.coordinate(hingeB)))
  })

  it("a belt's ratio follows which way each hinge counts", () => {
    // Wheel B's hinge is written the other way round (the wheel carries anchor A).
    const m = mechanism()
    const base = m.box("Base", [100, 5, 5], [30, -40, 0], { grounded: true })
    const a = m.box("Wheel A", [20, 20, 4], [0, 0, 0])
    const b = m.box("Wheel B", [10, 10, 4], [80, 0, 0])
    const hingeA = m.mate(m.anchor(base, [0, 0, 0]), m.anchor(a, [0, 0, 0]), "revolute")
    const hingeB = m.mate(m.anchor(b, [80, 0, 0]), m.anchor(base, [80, 0, 0]), "revolute")
    const belt = {
      id: newId<ConnectorId>(),
      kind: "belt" as const,
      name: "Belt",
      visible: true,
      materialId: null,
      ends: [
        { anchor: m.anchor(a, [0, 0, 0]).id, radiusMm: 20 },
        { anchor: m.anchor(b, [80, 0, 0]).id, radiusMm: 10 },
      ],
      widthMm: 6,
      thicknessMm: 1.5,
    }
    m.doc.connectors[belt.id] = belt
    const sim = m.sim(RAPIER)
    expect(sim.model.couplings[0]?.ratio).toBe(-2)
    crank(sim, a, 1, 2, () => undefined)
    // Both wheels turn counter-clockwise: B's own rotation about +Z is twice A's.
    const turned = (part: typeof a) => {
      const r = sim.scene.bodies.get(part.id)?.body.rotation() ?? { z: 0, w: 1 }
      return 2 * Math.atan2(r.z, r.w)
    }
    expect(sim.coordinate(hingeA)).toBeGreaterThan(5)
    expect(Math.abs(sim.coordinate(hingeB) / sim.coordinate(hingeA) + 2)).toBeLessThan(0.02)
    expect(Math.sign(turned(a))).toBe(Math.sign(Math.sin(sim.coordinate(hingeA) / 2)))
  })
})
