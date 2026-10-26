import { describe, expect, it } from "vitest"
import { signedArea2 } from "../../mesh/outline"
import { isSimple } from "../../testing/polygon"
import { autoShift, inv, spurOutline } from "./involute"

const deg = (d: number) => (d * Math.PI) / 180

describe("involute spur gear outline", () => {
  it("has the standard radii: pitch m z/2, base r cos α, tip r + m, root r − 1.25 m", () => {
    const g = spurOutline(1, 20, 20, 0)
    expect(g.r).toBe(10)
    expect(g.rb).toBeCloseTo(10 * Math.cos(deg(20)), 12)
    expect(g.ra).toBeCloseTo(11, 12)
    expect(g.rf).toBeCloseTo(8.75, 12)
    expect(g.tipShortened).toBe(false)
  })

  it("puts every flank point on the involute: polar angle grows by inv φ from the base circle", () => {
    // Tooth 0 is centred on +u; its lower flank point at ρ has angle −ψ(ρ) with
    // ψ(ρ) = ψp + inv α − inv φ(ρ), cos φ = rb/ρ, ψp = π/(2z) for x = 0.
    const g = spurOutline(2, 24, 20, 0)
    const flank = g.outline.slice(0, 9) // rf ≥ rb here? then the first point starts the flank
    for (const [u, v] of flank) {
      const rho = Math.hypot(u, v)
      if (rho < g.rb) continue
      const psi = Math.PI / 48 + inv(deg(20)) - inv(Math.acos(g.rb / rho))
      expect(Math.atan2(v, u)).toBeCloseTo(-psi, 10)
    }
  })

  it("has the textbook tip land for z = 20 (s_a = 2 r_a (π/2z + inv α − inv α_a) = 0.6949 m)", () => {
    const g = spurOutline(1, 20, 20, 0)
    const tooth = (a: number) => Math.abs(a) < Math.PI / 20 // tooth 0 only
    const tip = g.outline.filter(([u, v]) => Math.abs(Math.hypot(u, v) - g.ra) < 1e-9)
    const angles = tip.map(([u, v]) => Math.atan2(v, u)).filter(tooth)
    expect(g.ra * (Math.max(...angles) - Math.min(...angles))).toBeCloseTo(0.69488, 4)
    // Measured on the outline: thickness across the pitch circle, m(π/2 + 2 x tan α).
    for (const x of [0, 0.3, -0.2]) {
      const s = spurOutline(1, 20, 20, x)
      const lower = s.outline.slice(0, 12).filter(([u, v]) => tooth(Math.atan2(v, u)))
      const k = lower.findIndex(([u, v], i) => {
        const next = lower[i + 1]
        return next && Math.hypot(u, v) <= s.r && Math.hypot(next[0], next[1]) >= s.r
      })
      const [p, q] = [lower[k] ?? [0, 0], lower[k + 1] ?? [0, 0]]
      const [rp, rq] = [Math.hypot(p[0], p[1]), Math.hypot(q[0], q[1])]
      const f = (s.r - rp) / (rq - rp)
      const angle = Math.atan2(p[1], p[0]) * (1 - f) + Math.atan2(q[1], q[0]) * f
      // (interpolated between flank samples: good to a few thousandths of a module)
      expect(2 * s.r * -angle).toBeCloseTo(Math.PI / 2 + 2 * x * Math.tan(deg(20)), 2)
    }
  })

  it("shifts small gears out of undercut and shortens pointed tips to a 0.25 m land", () => {
    expect(autoShift(12)).toBeCloseTo(5 / 17, 12)
    expect(autoShift(17)).toBe(0)
    expect(autoShift(40)).toBe(0)
    const g = spurOutline(1, 8, 20, autoShift(8))
    expect(g.tipShortened).toBe(true)
    expect(g.ra).toBeLessThan(4 + 1 + autoShift(8))
  })

  it.each([8, 12, 17, 20, 40, 100])("z = %i: a simple counter-clockwise outline", (z) => {
    const g = spurOutline(1, z, 20, autoShift(z))
    expect(signedArea2(g.outline)).toBeGreaterThan(0)
    expect(isSimple(g.outline)).toBe(true)
    const radii = g.outline.map(([u, v]) => Math.hypot(u, v))
    expect(Math.min(...radii)).toBeCloseTo(g.rf, 9)
    expect(Math.max(...radii)).toBeCloseTo(g.ra, 9)
  })
})
