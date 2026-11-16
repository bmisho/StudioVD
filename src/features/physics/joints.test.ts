// @vitest-environment node
import RAPIER from "@dimforge/rapier3d-compat"
import { beforeAll, describe, expect, it } from "vitest"
import type { Vec3 } from "@/core/schema"
import { mechanism } from "./testing/mechanism"

beforeAll(async () => {
  await RAPIER.init()
})

const Y: Vec3 = [0, 1, 0]

/** A carriage on a rail along +X: prismatic, between `min` and `max` mm. */
function slider(limits: { min: number; max: number } | undefined, swap = false) {
  const m = mechanism()
  const rail = m.box("Rail", [200, 5, 5], [0, 0, 0], { grounded: true })
  const carriage = m.box("Carriage", [10, 10, 10], [0, 20, 0])
  const [onRail, onCarriage] = [
    m.anchor(rail, [0, 20, 0], [1, 0, 0], [0, 1, 0]),
    m.anchor(carriage, [0, 20, 0], [1, 0, 0], [0, 1, 0]),
  ]
  // `swap`: the carriage carries anchor A, so the coordinate runs the other way.
  const mate = swap
    ? m.mate(onCarriage, onRail, "prismatic", { ...(limits && { limits }) })
    : m.mate(onRail, onCarriage, "prismatic", { ...(limits && { limits }) })
  return { m, carriage, mate }
}

describe("joints of every type (PLAN 10.1)", () => {
  it("a slider follows the drag and stops at its limits", () => {
    const { m, carriage, mate } = slider({ min: -30, max: 50 })
    const sim = m.sim(RAPIER)
    sim.grab(carriage, [0, 20, 0])
    sim.moveTo([20, 20, 0])
    sim.step(sim.seconds(1))
    expect(sim.coordinate(mate)).toBeCloseTo(20, 1)
    let [lo, hi] = [0, 0]
    sim.moveTo([400, 60, 0]) // far past the upper limit, and off the rail
    sim.step(sim.seconds(1.5), () => (hi = Math.max(hi, sim.coordinate(mate))))
    // The drag pulls as hard as it may: the stop gives a few hundredths of a millimetre.
    expect(hi).toBeLessThan(50.2)
    expect(Math.abs(sim.coordinate(mate) - 50)).toBeLessThan(0.2)
    sim.moveTo([-400, 0, 0])
    sim.step(sim.seconds(1.5), () => (lo = Math.min(lo, sim.coordinate(mate))))
    expect(lo).toBeGreaterThan(-30.2)
    // It slid along X only: the rail holds it across.
    const at = sim.position(carriage)
    expect(Math.hypot(at[1] - 20, at[2])).toBeLessThan(0.01)
  })

  it("limits are in the mate's own direction when anchor A rides on the moving part", () => {
    const { m, carriage, mate } = slider({ min: -30, max: 50 }, true)
    const sim = m.sim(RAPIER)
    // Coordinate = rail relative to carriage: the carriage moving +X counts negative.
    sim.grab(carriage, [0, 20, 0])
    sim.moveTo([400, 20, 0])
    sim.step(sim.seconds(1.5))
    expect(sim.coordinate(mate)).toBeCloseTo(-30, 1)
    expect(sim.position(carriage)[0]).toBeCloseTo(30, 1)
  })

  it("limits count from where the mate was snapped, not from the design pose", () => {
    const { m, carriage, mate } = slider({ min: -30, max: 50 })
    carriage.pose.positionMm = [40, 20, 0] // already 40 mm along at the design pose
    const sim = m.sim(RAPIER)
    expect(sim.coordinate(mate)).toBeCloseTo(40, 9)
    sim.grab(carriage, [40, 20, 0])
    sim.moveTo([400, 20, 0])
    sim.step(sim.seconds(1.5))
    expect(Math.abs(sim.position(carriage)[0] - 50)).toBeLessThan(0.2) // 10 mm of travel left
  })

  it("a hinge keeps to its limits either way and reads its angle", () => {
    const m = mechanism()
    const post = m.box("Post", [5, 5, 5], [0, 0, 0], { grounded: true })
    const arm = m.box("Arm", [40, 4, 4], [40, 0, 0])
    const limits = { min: -Math.PI / 6, max: Math.PI / 3 }
    const hinge = m.mate(m.anchor(post, [0, 0, 0]), m.anchor(arm, [0, 0, 0]), "revolute", {
      limits,
    })
    const sim = m.sim(RAPIER)
    sim.grab(arm, [80, 0, 0])
    let peak = 0
    sim.moveTo([-80, 60, 0]) // towards +150°
    sim.step(sim.seconds(2), () => (peak = Math.max(peak, sim.coordinate(hinge))))
    // Rapier's stop gives about half a degree under the strongest drag.
    expect(peak).toBeLessThan(limits.max + 0.02)
    expect(sim.coordinate(hinge)).toBeCloseTo(limits.max, 1)
    sim.moveTo([0, -80, 0]) // towards −90°
    sim.step(sim.seconds(2), () => (peak = Math.min(peak, sim.coordinate(hinge))))
    expect(peak).toBeGreaterThan(limits.min - 0.02)
    expect(sim.coordinate(hinge)).toBeCloseTo(limits.min, 1)
  })

  it("a hinge allowed more than half a turn stops where its limit is", () => {
    const m = mechanism()
    const post = m.box("Post", [5, 5, 5], [0, 0, 0], { grounded: true })
    const arm = m.box("Arm", [40, 4, 4], [40, 0, 0])
    const limits = { min: -1, max: 4 } // +229°: past the half turn Rapier can measure
    const hinge = m.mate(m.anchor(post, [0, 0, 0]), m.anchor(arm, [0, 0, 0]), "revolute", {
      limits,
    })
    const sim = m.sim(RAPIER)
    sim.grab(arm, [80, 0, 0])
    const steps = sim.seconds(4)
    let peak = 0
    sim.step(steps, (i) => {
      const turn = ((i + 1) / steps) * 1.5 * 2 * Math.PI // one and a half turns, steadily
      sim.moveTo([80 * Math.cos(turn), 80 * Math.sin(turn), 0])
      peak = Math.max(peak, sim.coordinate(hinge))
    })
    expect(peak).toBeGreaterThan(3.9)
    expect(peak).toBeLessThan(4.02)
  })

  it("a free hinge counts whole turns", () => {
    const m = mechanism()
    const post = m.box("Post", [5, 5, 5], [0, 0, 0], { grounded: true })
    const arm = m.box("Arm", [40, 4, 4], [40, 0, 0])
    const hinge = m.mate(m.anchor(post, [0, 0, 0]), m.anchor(arm, [0, 0, 0]), "revolute")
    const sim = m.sim(RAPIER)
    sim.grab(arm, [80, 0, 0])
    const steps = sim.seconds(4)
    sim.step(steps, (i) => {
      const turn = ((i + 1) / steps) * 3 * 2 * Math.PI // three turns, steadily
      sim.moveTo([80 * Math.cos(turn), 80 * Math.sin(turn), 0])
    })
    sim.step(sim.seconds(0.5))
    expect(sim.coordinate(hinge)).toBeCloseTo(6 * Math.PI, 1)
  })

  it("a ball joint holds its point and turns every way", () => {
    const m = mechanism()
    const post = m.box("Post", [5, 5, 5], [0, 0, 0], { grounded: true })
    const arm = m.box("Arm", [40, 4, 4], [40, 0, 0])
    m.mate(m.anchor(post, [0, 0, 0]), m.anchor(arm, [0, 0, 0]), "spherical")
    const sim = m.sim(RAPIER)
    sim.grab(arm, [80, 0, 0])
    sim.moveTo([0, 50, 62.45]) // 80 mm from the ball, up and out of the plane
    sim.step(sim.seconds(2))
    const tip = sim.grabPoint() ?? [0, 0, 0]
    expect(Math.hypot(tip[0], tip[1] - 50, tip[2] - 62.45)).toBeLessThan(0.5)
    expect(Math.hypot(...sim.position(arm))).toBeCloseTo(40, 2) // its centre stays 40 mm out
  })

  it("parts joined by fixed mates are one body, wherever the mate sits", () => {
    const m = mechanism()
    const post = m.box("Post", [5, 5, 5], [0, 0, 0], { grounded: true })
    const arm = m.box("Arm", [40, 4, 4], [40, 0, 0])
    const plate = m.box("Plate", [10, 10, 2], [90, 0, 0])
    const hinge = m.mate(m.anchor(post, [0, 0, 0]), m.anchor(arm, [0, 0, 0]), "revolute")
    m.mate(m.anchor(arm, [80, 0, 0], Y), m.anchor(plate, [80, 0, 0], Y), "fixed")
    const sim = m.sim(RAPIER)
    expect(sim.model.bodies.map((b) => b.parts.length)).toEqual([1, 2])
    expect(sim.scene.bodies.get(plate.id)).toBe(sim.scene.bodies.get(arm.id))
    sim.grab(plate, [100, 0, 0]) // dragging the plate swings the arm it is fixed to
    sim.moveTo([0, 100, 0])
    sim.step(sim.seconds(2))
    expect(sim.coordinate(hinge)).toBeCloseTo(Math.PI / 2, 1)
  })

  it("a three-hinge chain stays together and comes to rest", () => {
    const m = mechanism()
    const base = m.box("Base", [5, 5, 5], [0, 0, 0], { grounded: true })
    const links = [0, 1, 2].map((i) => m.box(`Link ${i}`, [20, 3, 3], [20 + 40 * i, 0, 0]))
    const chain = [base, ...links]
    const hinges = links.map((link, i) => {
      const at: Vec3 = [40 * i, 0, 0]
      const parent = chain[i] ?? base
      return m.mate(m.anchor(parent, at), m.anchor(link, at), "revolute")
    })
    const sim = m.sim(RAPIER)
    const last = links[2] ?? base
    sim.grab(last, [120, 0, 0])
    const steps = sim.seconds(3)
    sim.step(steps, (i) => {
      const t = (i / steps) * 4 * Math.PI
      sim.moveTo([70 + 40 * Math.cos(t), 50 * Math.sin(t), 0]) // whip the end about
    })
    sim.release()
    sim.step(sim.seconds(2))
    // Every hinge still closed: each link's inner end sits on its parent's outer end.
    for (const j of sim.scene.joints) {
      const [ta, tb] = [j.a.body.translation(), j.b.body.translation()]
      const [ra, rb] = [j.a.body.rotation(), j.b.body.rotation()]
      const world = (t: typeof ta, r: typeof ra, p: Vec3): Vec3 => {
        // q·p·q⁻¹ for the body's rotation, then its translation
        const [x, y, z, w] = [r.x, r.y, r.z, r.w]
        const [px, py, pz] = p
        const ix = w * px + y * pz - z * py
        const iy = w * py + z * px - x * pz
        const iz = w * pz + x * py - y * px
        const iw = -x * px - y * py - z * pz
        return [
          t.x + ix * w - iw * x - iy * z + iz * y,
          t.y + iy * w - iw * y - iz * x + ix * z,
          t.z + iz * w - iw * z - ix * y + iy * x,
        ]
      }
      const [pa, pb] = [world(ta, ra, j.localA), world(tb, rb, j.localB)]
      expect(Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2])).toBeLessThan(0.01)
    }
    for (const link of links) {
      const v = sim.scene.bodies.get(link.id)?.body.linvel() ?? { x: 9, y: 9, z: 9 }
      expect(Math.hypot(v.x, v.y, v.z)).toBeLessThan(1)
    }
    expect(hinges.every((h) => Number.isFinite(sim.coordinate(h)))).toBe(true)
  })
})
