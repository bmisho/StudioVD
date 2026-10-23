// @vitest-environment node
import RAPIER from "@dimforge/rapier3d-compat"
import { beforeAll, describe, expect, it } from "vitest"
import { quatFromAxisAngle, sub } from "@/core/math/vec3"
import { TEST_RIG_STOP_RAD } from "@/core/scene/testRig"
import type { Quat, Vec3 } from "@/core/schema"
import { createRigSim } from "./testing/rigHarness"

// PLAN 3.11: Rapier runs headless in Node on the same document -> model -> world path as the
// app. Lengths in mm. The leaf's far bottom edge (the "tip") is 60.5 mm from the hinge.
const TIP: Vec3 = [121, 81, 0]
const RADIUS_MM = 60.5
/** Allowed overshoot past the stop, as tip penetration. Rapier allows 0.01 mm by design. */
const PENETRATION_TOLERANCE_MM = 0.05
const TILTED: Quat = quatFromAxisAngle(
  (() => {
    const a: Vec3 = [1, 2, 3]
    const l = Math.hypot(...a)
    return [a[0] / l, a[1] / l, a[2] / l]
  })(),
  0.7
)

beforeAll(async () => {
  await RAPIER.init()
})

/** Grabs the tip and sweeps the cursor to `end` at `speedMmS`, then holds it for `holdS`. */
function pushIntoBase(frame: Quat | undefined, speedMmS: number, holdS = 1.5) {
  const sim = createRigSim(RAPIER, { frame })
  const start = sim.toWorld(TIP)
  const end = sim.toWorld([30, -30, 0]) // inside and below the base
  sim.grab(start)
  const sweep = sim.seconds(Math.hypot(...sub(end, start)) / speedMmS)
  let minAngle = 0
  let maxSeparation = 0
  for (let i = 0; i < sweep + sim.seconds(holdS); i++) {
    const u = Math.min(1, i / Math.max(1, sweep))
    sim.moveTo(start.map((s, k) => s + ((end[k] ?? 0) - s) * u) as Vec3)
    sim.step()
    minAngle = Math.min(minAngle, sim.leafAngle())
    maxSeparation = Math.max(maxSeparation, sim.hingeSeparation())
  }
  return { sim, minAngle, maxSeparation, finalAngle: sim.leafAngle() }
}

describe("hinge test rig (Rapier, headless)", () => {
  for (const [label, frame] of [
    ["axis-aligned", undefined],
    ["tilted", TILTED],
  ] as const) {
    for (const speed of [300, 2000, 10_000]) {
      it(`(a, b) ${label}: pushing the leaf into the base at ${speed} mm/s stops at the face`, () => {
        const { minAngle, maxSeparation, finalAngle } = pushIntoBase(frame, speed)
        // (a) never past the geometric stop (beyond Rapier's allowed penetration)
        const overshootMm = (TEST_RIG_STOP_RAD - minAngle) * RADIUS_MM
        expect(overshootMm).toBeLessThan(PENETRATION_TOLERANCE_MM)
        // ...and it really got there: the push is held at the face
        expect(Math.abs(finalAngle - TEST_RIG_STOP_RAD) * RADIUS_MM).toBeLessThan(0.05)
        // (b) the hinge never opens
        expect(maxSeparation).toBeLessThan(0.01)
      })
    }
  }

  it("(c) a hinge between differently rotated bodies starts without a jump", () => {
    // Base tilted, leaf tilted AND lifted 30° about the hinge: the two bodies' design
    // rotations differ. Regression guard for Rapier's shared-local-axis revolute (bodies
    // created with the part rotation jumped 42-48° on the first step).
    const sim = createRigSim(RAPIER, { frame: TILTED, leafLiftRad: Math.PI / 6 })
    const t0 = sim.leaf.body.translation()
    for (let i = 0; i < sim.seconds(0.5); i++) sim.step()
    const t1 = sim.leaf.body.translation()
    expect(Math.hypot(t1.x - t0.x, t1.y - t0.y, t1.z - t0.z)).toBeLessThan(1e-3)
    expect(Math.abs(sim.leafAngle())).toBeLessThan(1e-5)
    expect(sim.hingeSeparation()).toBeLessThan(1e-3)
  })

  it("(d) a released part comes to rest in free space", () => {
    const sim = createRigSim(RAPIER)
    sim.grab(TIP)
    sim.moveTo([100, 200, 0]) // fling upward
    for (let i = 0; i < sim.seconds(0.05); i++) sim.step()
    sim.release()
    const releaseSpeed = sim.leafMaxSpeed()
    let restAfter = Infinity
    for (let i = 0; i < sim.seconds(2); i++) {
      sim.step()
      if (restAfter === Infinity && sim.leafMaxSpeed() < 0.5) restAfter = (i + 1) / 120
    }
    expect(releaseSpeed).toBeGreaterThan(100) // it was moving when let go
    expect(restAfter).toBeLessThan(1)
    expect(sim.leafMaxSpeed()).toBeLessThan(0.5) // and stays at rest
    // It stopped in the air: damping did it, not the base (top-face stop is at +100.8°).
    expect(sim.leafAngle()).toBeGreaterThan(0)
    expect(sim.leafAngle()).toBeLessThan(Math.PI / 2)
  })

  it("the drag follows a reachable cursor target", () => {
    const sim = createRigSim(RAPIER)
    sim.grab(TIP)
    const target: Vec3 = [60.5 + RADIUS_MM * Math.SQRT1_2, 81 + RADIUS_MM * Math.SQRT1_2, 0] // +45°
    sim.moveTo(target)
    for (let i = 0; i < sim.seconds(1); i++) sim.step()
    const grab = sim.grabPoint()
    if (!grab) throw new Error("not dragging")
    expect(Math.hypot(...sub(grab, target))).toBeLessThan(0.5)
    expect(sim.leafAngle()).toBeCloseTo(Math.PI / 4, 2)
  })
})
