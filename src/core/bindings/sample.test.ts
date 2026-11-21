import { describe, expect, it } from "vitest"
import { createTestRig } from "@/core/scene/testRig"
import type { AnchorId, Binding, BindingId, Vec3 } from "@/core/schema"
import { simulate } from "@/core/sim/engine/simulate"
import { schematic } from "@/core/sim/engine/testing"
import { sampleBindings, type Live } from "./sample"

// The sampler (PLAN 13.4, 13.6): 3D measurements into the solver's inputs.

/** A schematic builder whose document also holds the test rig (base, hinged leaf). */
function rigWithSchematic() {
  const b = schematic()
  const rig = createTestRig()
  for (const a of rig.assets) b.doc.assets[a.id] = a
  for (const p of rig.parts) b.doc.parts[p.id] = { ...p }
  for (const a of rig.anchors) b.doc.anchors[a.id] = a
  for (const m of rig.mates) b.doc.mates[m.id] = m
  const [base, leaf] = rig.parts
  const hinge = rig.mates[0]
  if (!base || !leaf || !hinge) throw new Error("rig")
  return { ...b, base: base.id, leaf: leaf.id, hinge: hinge.id, anchors: rig.anchors }
}

const still: Live = {
  pose: () => undefined,
  reading: () => undefined,
  touching: () => false,
  ray: () => null,
}

let n = 0
const bind = (doc: { bindings: Record<string, Binding> }, b: Omit<Binding, "id">) => {
  const id = `00000000-0000-4000-8000-0000000b${String(++n).padStart(4, "0")}` as BindingId
  doc.bindings[id] = { ...b, id }
  return id
}

describe("bindings into the solver", () => {
  it("a hinge's angle turns a potentiometer that dims an LED", () => {
    const r = rigWithSchematic()
    const bat = r.block("electrical.battery@1", { emf: 5, rInternal: 0 })
    const gnd = r.block("electrical.ground@1")
    const pot = r.block("electrical.potentiometer@1", { resistance: 1000 })
    const led = r.block("electrical.led@1")
    r.wire(bat, "neg", gnd, "gnd")
    r.wire(pot, "a", gnd, "gnd")
    r.wire(bat, "pos", pot, "b")
    r.wire(pot, "wiper", led, "anode")
    r.wire(led, "cathode", gnd, "gnd")
    // A quarter turn either way spans the whole track.
    bind(r.doc, {
      from: { kind: "mateCoordinate", mate: r.hinge },
      to: { kind: "param", node: pot, param: "position" },
      scale: 1 / Math.PI,
      offset: 0.5,
      min: 0,
      max: 1,
    })
    const at = (angle: number) => {
      const injected = sampleBindings(r.doc, { ...still, reading: () => angle }, () => 0)
      const out = simulate(r.doc, { injected })
      return {
        position: injected.params[pot]?.position,
        current: out.ports[`${led}/anode`]?.flow ?? 0,
      }
    }
    const shut = at(-Math.PI / 2)
    const half = at(0)
    const open = at(Math.PI / 2)
    expect([shut.position, half.position, open.position]).toEqual([0, 0.5, 1])
    expect(shut.current).toBeLessThan(1e-6)
    expect(open.current).toBeGreaterThan(half.current)
  })

  it("contact opens a normally-closed switch, and bound inputs and masses arrive", () => {
    const r = rigWithSchematic()
    const sw = r.block("electrical.switch@1", { closed: true })
    const probe = r.block("data.probe@1")
    const load = r.block("mechanical.load@1")
    bind(r.doc, {
      from: { kind: "contact", a: r.base, b: r.leaf },
      to: { kind: "param", node: sw, param: "closed" },
      scale: -1,
      offset: 1,
    })
    bind(r.doc, {
      from: { kind: "mass", part: r.leaf },
      to: { kind: "input", node: probe, port: "value" },
      scale: 1,
      offset: 0,
    })
    bind(r.doc, {
      from: { kind: "gravityLoad", mate: r.hinge },
      to: { kind: "param", node: load, param: "torque" },
      scale: 1,
      offset: 0,
    })
    const touching = sampleBindings(r.doc, { ...still, touching: () => true }, () => 0.25)
    expect(touching.params[sw]?.closed).toBe(false)
    expect(touching.signals[`${probe}/value`]).toBe(0.25)
    expect(typeof touching.params[load]?.torque).toBe("number")
    expect(sampleBindings(r.doc, still, () => 0).params[sw]?.closed).toBe(true)
  })

  it("light reaches a sensor along the anchors unless a part is in the way", () => {
    const r = rigWithSchematic()
    const lamp = r.block("light.emitter@1", { intensity: 2 })
    const sensor = r.block("light.sensor@1")
    // Two anchors on the base 1 m apart, facing each other: 1/d² = 1 per m².
    const anchor = (id: string, x: number, zx: number) => {
      const a = {
        id: id as AnchorId,
        partId: r.base,
        kind: "point" as const,
        frame: { originMm: [x, 0, 0] as Vec3, z: [zx, 0, 0] as Vec3, x: [0, 1, 0] as Vec3 },
        name: id,
        source: { kind: "manual" as const },
      }
      r.doc.anchors[a.id] = a
      return a
    }
    const ea = anchor("00000000-0000-4000-8000-0000000e0001", 0, 1)
    const sa = anchor("00000000-0000-4000-8000-0000000e0002", 1000, -1)
    bind(r.doc, {
      from: {
        kind: "light",
        node: lamp,
        port: "light",
        emitter: ea.id,
        sensor: sa.id,
        halfAngle: Math.PI,
      },
      to: { kind: "input", node: sensor, port: "light" },
      scale: 1,
      offset: 0,
    })
    const clear = sampleBindings(r.doc, still, () => 0)
    const key = `${sensor}/light`
    const link = clear.light[key]
    expect(link?.from).toBe(`${lamp}/light`)
    expect(link?.gain).toBeCloseTo(1, 12)
    const blocked = sampleBindings(r.doc, { ...still, ray: () => 1 }, () => 0)
    expect(blocked.light[key]?.gain).toBe(0)
    // Through the solver: the sensor reads the lamp's intensity times the path's gain.
    const out = simulate(r.doc, { injected: clear })
    expect(out.signals[`${sensor}/reading`]).toBeCloseTo(2, 12) // 2 cd at 1 m: 2 lx
  })
})
