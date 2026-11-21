import { describe, expect, it } from "vitest"
import type { BlockDefId } from "@/core/schema"
import { MODELS, modelKey } from "../models/registry"
import { BEHAVIOURS } from "./behaviours"
import { simulate } from "./simulate"
import { schematic } from "./testing"

// Every diagnostic (PLAN 12.2, 12.10), and every model solving without a crash.

const codes = (r: ReturnType<typeof simulate>) => r.diagnostics.map((d) => d.code).sort()

describe("diagnostics", () => {
  it("a circuit without ground", () => {
    const b = schematic()
    const bat = b.block("electrical.battery@1")
    const res = b.block("electrical.resistor@1")
    b.wire(bat, "pos", res, "a")
    b.wire(res, "b", bat, "neg")
    const r = simulate(b.doc)
    expect(codes(r)).toContain("missing-ground")
    expect(r.diagnostics.find((d) => d.code === "missing-ground")?.nodes.sort()).toEqual(
      [bat, res].sort()
    )
  })

  it("a floating part of a grounded circuit", () => {
    const b = schematic()
    const gnd = b.block("electrical.ground@1")
    const r1 = b.block("electrical.resistor@1")
    b.wire(r1, "a", gnd, "gnd")
    const [r2, r3] = [b.block("electrical.resistor@1"), b.block("electrical.resistor@1")]
    b.wire(r2, "b", r3, "a")
    expect(codes(simulate(b.doc))).toEqual(["floating"])
  })

  it("two ideal sources fighting over one pair of nets", () => {
    const b = schematic()
    const gnd = b.block("electrical.ground@1")
    const [a, c] = [5, 6].map((emf) => b.block("electrical.battery@1", { emf, rInternal: 0 }))
    if (!a || !c) throw new Error("blocks")
    b.wire(a, "neg", gnd, "gnd")
    b.wire(c, "neg", gnd, "gnd")
    b.wire(a, "pos", c, "pos")
    const r = simulate(b.doc)
    expect(codes(r)).toEqual(["singular"])
    expect(r.converged).toBe(false)
  })

  it("air and water in one fluid circuit", () => {
    const b = schematic()
    const src = b.block("fluid.pressureSource@1", { medium: "air" })
    const pump = b.block("electromech.pump@1") // water ports
    b.wire(src, "out", pump, "inlet")
    expect(codes(simulate(b.doc))).toContain("medium-mismatch")
  })

  it("a model from a newer StudioVD, a runaway axis, a rating, a program error", () => {
    const b = schematic()
    const gnd = b.block("electrical.ground@1")
    const bat = b.block("electrical.battery@1", { emf: 12, rInternal: 0 })
    const hot = b.block("electrical.resistor@1", { resistance: 10, powerRating: 0.25 })
    b.wire(bat, "neg", gnd, "gnd")
    b.wire(bat, "pos", hot, "a")
    b.wire(hot, "b", gnd, "gnd")
    const frame = b.block("mechanical.groundRotational@1")
    // Nothing holds the axis: only gmin (1e-12 N·m·s) resists, so it "spins" at 1e6 rad/s.
    const load = b.block("mechanical.load@1", { torque: 1e-6 })
    b.wire(load, "frame", frame, "frame")
    const uno = b.block("mcu.arduinoUno@1")
    const unoDef = b.doc.schematic.nodes[uno]?.blockDefId
    const def = unoDef ? b.doc.schematic.blockDefs[unoDef] : undefined
    if (def) def.behaviour = "D13 = A0 >"
    const future = "00000000-0000-4000-8000-0000000000f0" as BlockDefId
    b.doc.schematic.blockDefs[future] = {
      id: future,
      name: "Warp drive",
      simModel: "electromech.warpDrive@9",
      ports: [],
      params: [],
    }
    const node = "00000000-0000-4000-8000-0000000000f1" as keyof typeof b.doc.schematic.nodes
    b.doc.schematic.nodes[node] = {
      id: node,
      blockDefId: future,
      position: { x: 0, y: 0 },
      label: "W1",
      paramValues: {},
    }
    expect(codes(simulate(b.doc))).toEqual(["program", "rating", "runaway", "unknown-model"])
  })

  it("a signal loop that never settles", () => {
    const b = schematic()
    const not = b.block("data.not@1")
    b.wire(not, "out", not, "a")
    expect(codes(simulate(b.doc))).toEqual(["signal-loop"])
  })
})

describe("every built-in model", () => {
  it("has a behaviour, or is a programmable board", () => {
    for (const m of MODELS)
      expect(m.programmable === true || Object.hasOwn(BEHAVIOURS, m.id), m.id).toBe(true)
  })

  it("solves on its own with a terminal of each domain on its reference, without throwing", () => {
    for (const m of MODELS) {
      const b = schematic()
      const node = b.block(modelKey(m))
      const refs: Record<string, string> = {
        electrical: b.block("electrical.ground@1"),
        mechRotational: b.block("mechanical.groundRotational@1"),
        mechTranslational: b.block("mechanical.groundTranslational@1"),
      }
      // One terminal per domain: wiring them all would short every source (rightly singular).
      const done = new Set<string>()
      const isRef = m.id.startsWith("mechanical.ground") || m.id === "electrical.ground"
      for (const p of m.ports) {
        const ref = refs[p.domain]
        if (!ref || p.direction !== "terminal" || isRef || done.has(p.domain)) continue
        done.add(p.domain)
        b.wire(node, p.key, ref as typeof node, p.domain === "electrical" ? "gnd" : "frame")
      }
      const r = simulate(b.doc)
      expect(
        r.diagnostics.filter((d) => d.severity === "error" && d.code !== "missing-ground"),
        m.id
      ).toEqual([])
    }
  })
})
