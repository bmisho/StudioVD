import { describe, expect, it } from "vitest"
import type { Vec3 } from "@/core/schema"
import { DRAG_SPRING, dragForce, effectiveMass } from "./dragSpring"
import { length } from "@/core/math/vec3"

const zero: Vec3 = [0, 0, 0]

describe("effectiveMass", () => {
  it("is the body mass at the centre of mass", () => {
    expect(effectiveMass(2, 10, 0)).toBe(2)
  })

  it("matches a thin rod grabbed at its end: m/4", () => {
    // Rod of length L about its centre: I = m L²/12, arm L/2 -> 1/m_eff = 1/m + 3/m.
    const m = 0.3
    const L = 200
    expect(effectiveMass(m, (m * L * L) / 12, L / 2)).toBeCloseTo(m / 4, 12)
  })

  it("is zero for a massless body", () => {
    expect(effectiveMass(0, 1, 10)).toBe(0)
  })
})

describe("dragForce", () => {
  it("is zero at the target when at rest", () => {
    expect(dragForce([5, 5, 5], [5, 5, 5], zero, 1)).toEqual([0, 0, 0])
  })

  it("is the plain spring-damper k·Δx − c·v below the limits", () => {
    const m = 0.5
    const w = 2 * Math.PI * DRAG_SPRING.frequencyHz
    const f = dragForce(zero, [1, 0, 0], [0, 2, 0], m)
    expect(f[0]).toBeCloseTo(m * w * w * 1, 9) // k Δx
    expect(f[1]).toBeCloseTo(-2 * m * w * 2, 9) // −c v (ζ = 1)
  })

  it("never asks for more than the speed limit", () => {
    // Moving at the speed limit toward a far target: no further acceleration.
    const f = dragForce(zero, [1e6, 0, 0], [DRAG_SPRING.maxSpeedMmS, 0, 0], 1)
    expect(length(f)).toBeCloseTo(0, 9)
  })

  it("clamps the force to m_eff · a_max", () => {
    const f = dragForce(zero, [0, -1e6, 0], zero, 0.2)
    expect(length(f)).toBeCloseTo(0.2 * DRAG_SPRING.maxAccelMmS2, 9)
    expect(f[1]).toBeLessThan(0)
  })

  it("brings a 1-D mass to the target without overshoot at the app's step (1/120 s)", () => {
    const m = 0.05
    const dt = 1 / 120
    let x = 0
    let v = 0
    let peak = 0
    for (let i = 0; i < 240; i++) {
      const [f] = dragForce([x, 0, 0], [100, 0, 0], [v, 0, 0], m)
      v += (f / m) * dt // semi-implicit Euler, as Rapier integrates forces
      x += v * dt
      peak = Math.max(peak, x)
    }
    expect(x).toBeCloseTo(100, 3)
    expect(peak).toBeLessThan(100.5)
  })
})
