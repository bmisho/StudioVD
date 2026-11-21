import { describe, expect, it } from "vitest"
import { simulate } from "./simulate"
import { schematic } from "./testing"

// Known answers (PLAN 12.10): motors, gears, holding actuators.

type Result = ReturnType<typeof simulate>
const at = (r: Result, node: string, port: string) => r.ports[`${node}/${port}`]

/** A battery on a DC motor (kt = ke = 0.01, R = 2 Ω), frame on a rotational frame block. */
function motorRig(emf: number) {
  const b = schematic()
  const bat = b.block("electrical.battery@1", { emf, rInternal: 0 })
  const gnd = b.block("electrical.ground@1")
  const motor = b.block("electromech.dcMotor@1", { kt: 0.01, ke: 0.01, resistance: 2 })
  const frame = b.block("mechanical.groundRotational@1")
  b.wire(bat, "neg", gnd, "gnd")
  b.wire(bat, "pos", motor, "pos")
  b.wire(motor, "neg", gnd, "gnd")
  b.wire(motor, "frame", frame, "frame")
  return { ...b, motor, frame }
}

describe("mechanical known answers", () => {
  it("a stalled motor draws V/R and makes kt·I", () => {
    const { doc, wire, motor, frame } = motorRig(6)
    wire(motor, "shaft", frame, "frame")
    const r = simulate(doc)
    expect(at(r, motor, "pos")?.flow).toBeCloseTo(3, 9)
    expect(at(r, motor, "shaft")?.flow).toBeCloseTo(-0.03, 9) // into the shaft net
    expect(r.diagnostics.map((d) => d.code)).toEqual(["stalled"])
  })

  it("an unloaded motor spins at V/ke", () => {
    const { doc, motor } = motorRig(6)
    const r = simulate(doc)
    expect(at(r, motor, "shaft")?.effort).toBeCloseTo(600, 3)
    expect(Math.abs(at(r, motor, "pos")?.flow ?? 1)).toBeLessThan(1e-6)
  })

  it("a stalled motor's supply power all goes into its winding (energy balance)", () => {
    const { doc, wire, motor, frame } = motorRig(6)
    wire(motor, "shaft", frame, "frame")
    const r = simulate(doc)
    expect(r.supplied).toBeCloseTo(18, 9) // 6 V × 3 A
    expect(r.power[motor]).toBeCloseTo(18, 9) // I²R = 9 × 2
    expect(Object.values(r.power).reduce((s, p) => s + p, 0)).toBeCloseTo(0, 9)
  })

  it("a gear pair trades speed for torque and keeps power", () => {
    const { doc, block, wire, motor, frame } = motorRig(6)
    const gear = block("mechanical.gear@1", { ratio: 5, efficiency: 1 })
    wire(motor, "shaft", gear, "input")
    wire(gear, "frame", frame, "frame")
    wire(gear, "output", frame, "frame") // output held: the motor stalls through the gear
    const r = simulate(doc)
    expect(at(r, gear, "input")?.flow).toBeCloseTo(0.03, 9) // motor torque in
    expect(at(r, gear, "output")?.flow).toBeCloseTo(-0.15, 9) // 5× out
  })

  it("a servo holds a load within its stall torque and is back-driven beyond it", () => {
    const run = (torque: number) => {
      const b = schematic()
      const bat = b.block("electrical.battery@1", { emf: 5, rInternal: 0 })
      const gnd = b.block("electrical.ground@1")
      const servo = b.block("electromech.servo@1", {}, "Servo")
      const frame = b.block("mechanical.groundRotational@1")
      const load = b.block("mechanical.load@1", { torque })
      b.wire(bat, "neg", gnd, "gnd")
      b.wire(bat, "pos", servo, "pos")
      b.wire(servo, "neg", gnd, "gnd")
      b.wire(servo, "frame", frame, "frame")
      b.wire(load, "frame", frame, "frame")
      b.wire(servo, "shaft", load, "axis")
      return { r: simulate(b.doc), servo }
    }
    const held = run(0.09) // half the default 0.18 N·m stall torque
    expect(held.r.diagnostics).toEqual([])
    expect(at(held.r, held.servo, "shaft")?.flow).toBeCloseTo(0.09, 9)
    // Idle 10 mA plus half the 1 A stall current.
    expect(at(held.r, held.servo, "pos")?.flow).toBeCloseTo(0.51, 6)
    const stalled = run(0.3)
    expect(stalled.r.diagnostics.map((d) => d.code)).toContain("back-driven")
  })
})
