import { describe, expect, it } from "vitest"
import { compileNetlist } from "./netlist"
import { simulate } from "./simulate"
import { schematic } from "./testing"

// Known answers (PLAN 12.10): electrical circuits.

const v = (r: ReturnType<typeof simulate>, node: string, port: string) =>
  r.ports[`${node}/${port}`]?.effort ?? NaN
const i = (r: ReturnType<typeof simulate>, node: string, port: string) =>
  r.ports[`${node}/${port}`]?.flow ?? NaN

/** Battery (ideal, emf) with its − on ground; returns the battery and ground. */
function powered(emf: number) {
  const b = schematic()
  const bat = b.block("electrical.battery@1", { emf, rInternal: 0 })
  const gnd = b.block("electrical.ground@1")
  b.wire(bat, "neg", gnd, "gnd")
  return { ...b, bat, gnd }
}

/** KCL: what every block takes from each net sums to zero there. */
function kclResidual(doc: Parameters<typeof simulate>[0], r: ReturnType<typeof simulate>): number {
  const netlist = compileNetlist(doc)
  let worst = 0
  for (const net of netlist.nets) {
    if (net.reference) continue
    const sum = net.ports.reduce((s, id) => s + (r.ports[id]?.flow ?? 0), 0)
    worst = Math.max(worst, Math.abs(sum))
  }
  return worst
}

describe("electrical known answers", () => {
  it("a voltage divider halves its supply; KCL holds to 1e-9 and power balances", () => {
    const { doc, block, wire, bat, gnd } = powered(10)
    const r1 = block("electrical.resistor@1", { resistance: 1000 })
    const r2 = block("electrical.resistor@1", { resistance: 1000 })
    wire(bat, "pos", r1, "a")
    wire(r1, "b", r2, "a")
    wire(r2, "b", gnd, "gnd")
    const r = simulate(doc)
    expect(r.converged).toBe(true)
    // gmin (1e-12 S on every net) shifts node voltages by about gmin·R·V: nV here.
    expect(v(r, r1, "b")).toBeCloseTo(5, 8)
    expect(i(r, r1, "a")).toBeCloseTo(0.005, 10)
    expect(kclResidual(doc, r)).toBeLessThan(1e-9)
    expect(Object.values(r.power).reduce((s, p) => s + p, 0)).toBeCloseTo(0, 9)
    expect(r.supplied).toBeCloseTo(0.05, 9)
    expect(r.diagnostics).toEqual([])
  })

  it("series and parallel: 12 V across 100 Ω + (200 Ω ∥ 300 Ω)", () => {
    const { doc, block, wire, bat, gnd } = powered(12)
    const [ra, rb, rc] = [100, 200, 300].map((resistance) =>
      block("electrical.resistor@1", { resistance, powerRating: 10 })
    )
    if (!ra || !rb || !rc) throw new Error("blocks")
    wire(bat, "pos", ra, "a")
    wire(ra, "b", rb, "a")
    wire(ra, "b", rc, "a")
    wire(rb, "b", gnd, "gnd")
    wire(rc, "b", gnd, "gnd")
    const r = simulate(doc)
    // 200 ∥ 300 = 120 Ω; I = 12/220 A; the parallel pair sees 120·I.
    expect(i(r, ra, "a")).toBeCloseTo(12 / 220, 10)
    expect(v(r, ra, "b")).toBeCloseTo((12 * 120) / 220, 9)
    expect(i(r, rb, "a") / i(r, rc, "a")).toBeCloseTo(1.5, 9)
    expect(kclResidual(doc, r)).toBeLessThan(1e-9)
  })

  it("a red LED behind 150 Ω from 5 V runs at its rated 20 mA and 2.0 V", () => {
    const { doc, block, wire, bat, gnd } = powered(5)
    const res = block("electrical.resistor@1", { resistance: 150 })
    const led = block("electrical.led@1")
    wire(bat, "pos", res, "a")
    wire(res, "b", led, "anode")
    wire(led, "cathode", gnd, "gnd")
    const r = simulate(doc)
    expect(r.converged).toBe(true)
    expect(i(r, led, "anode")).toBeCloseTo(0.02, 9)
    expect(v(r, led, "anode")).toBeCloseTo(2.0, 6)
    expect(r.signals[`${led}/light`]).toBeCloseTo(0.1, 6) // its rated intensity
  })

  it("a relay keeps its contacts between drop-out and pick-up (hysteresis)", () => {
    const run = (emf: number, state?: ReturnType<typeof simulate>["state"]) => {
      const { doc, block, wire, bat, gnd } = powered(emf)
      const relay = block("electrical.relay@1", {}, "K1")
      wire(bat, "pos", relay, "coilPos")
      wire(relay, "coilNeg", gnd, "gnd")
      return { r: simulate(doc, { state }), relay }
    }
    const on = run(5)
    expect(on.r.state[on.relay]?.on).toBe(true)
    // 2 V is between 0.5 V drop-out and 3.75 V pick-up: it stays as it was.
    const held = run(2, on.r.state)
    expect(held.r.state[held.relay]?.on).toBe(true)
    const fresh = run(2)
    expect(fresh.r.state[fresh.relay]?.on).toBe(false)
  })
})
