import { describe, expect, it } from "vitest"
import type { Vec3 } from "@/core/schema"
import {
  DRAG_SPRING,
  dragAcceleration,
  dragForce,
  effectiveMass,
  pointForce,
  type Sym3,
} from "./dragSpring"
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

describe("pointForce", () => {
  const m = 0.3
  const L = 200
  // A thin rod along x: I about y and z is m L²/12, about its own axis almost nothing.
  const rod: Sym3 = [1 / (m * 1e-3), 0, 0, 12 / (m * L * L), 0, 12 / (m * L * L)]

  it("at the centre of mass is m·a", () => {
    expect(pointForce(m, rod, [0, 0, 0], [3, -4, 5])).toEqual([3 * m, -4 * m, 5 * m])
  })

  it("across a rod's end feels m/4, along it the whole mass", () => {
    const end: Vec3 = [L / 2, 0, 0]
    const across = pointForce(m, rod, end, [0, 1, 0])
    expect(across[1]).toBeCloseTo(m / 4, 12)
    expect(Math.hypot(across[0], across[2])).toBeCloseTo(0, 12)
    expect(pointForce(m, rod, end, [1, 0, 0])[0]).toBeCloseTo(m, 12)
    // The scalar bound sizes the same pull by the rod's own axis: thousands of times weaker.
    expect(effectiveMass(m, m * 1e-3, L / 2) / (m / 4)).toBeLessThan(1e-3)
  })

  it("gives exactly the asked acceleration to a free body's point", () => {
    // a_point = F/m + (W (r × F)) × r for a body at rest.
    const r: Vec3 = [30, -20, 10]
    const W: Sym3 = [0.02, 0.003, -0.001, 0.05, 0.002, 0.01]
    const want: Vec3 = [100, -250, 40]
    const F = pointForce(m, W, r, want)
    const t: Vec3 = [
      r[1] * F[2] - r[2] * F[1],
      r[2] * F[0] - r[0] * F[2],
      r[0] * F[1] - r[1] * F[0],
    ]
    const w: Vec3 = [
      W[0] * t[0] + W[1] * t[1] + W[2] * t[2],
      W[1] * t[0] + W[3] * t[1] + W[4] * t[2],
      W[2] * t[0] + W[4] * t[1] + W[5] * t[2],
    ]
    const got: Vec3 = [
      F[0] / m + (w[1] * r[2] - w[2] * r[1]),
      F[1] / m + (w[2] * r[0] - w[0] * r[2]),
      F[2] / m + (w[0] * r[1] - w[1] * r[0]),
    ]
    got.forEach((v, i) => expect(v).toBeCloseTo(want[i] ?? NaN, 9))
  })

  it("dragAcceleration is the servo law per unit mass, clamped", () => {
    const w = 2 * Math.PI * DRAG_SPRING.frequencyHz
    expect(dragAcceleration(zero, [1, 0, 0], zero)[0]).toBeCloseTo(w * w, 9)
    expect(length(dragAcceleration(zero, [0, 1e6, 0], zero))).toBeCloseTo(
      DRAG_SPRING.maxAccelMmS2,
      9
    )
  })
})
