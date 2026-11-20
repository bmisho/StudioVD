// @vitest-environment node
import RAPIER from "@dimforge/rapier3d-compat"
import { beforeAll, describe, expect, it } from "vitest"
import type { Vec3 } from "@/core/schema"
import type { ColliderGeometry } from "./partColliders"
import { mechanism } from "./testing/mechanism"

beforeAll(async () => {
  await RAPIER.init()
})

const Y: Vec3 = [0, 1, 0]
const [OUTER, INNER, HALF_HEIGHT, WEDGES] = [11, 4, 3.5, 16]

/** A ring about Y as convex wedges, as a decomposition gives it (Rust tests the real one). */
function ringPieces(): Float32Array[] {
  return Array.from({ length: WEDGES }, (_, i) => {
    const [a0, a1] = [(i / WEDGES) * 2 * Math.PI, ((i + 1) / WEDGES) * 2 * Math.PI]
    const points: number[] = []
    for (const a of [a0, a1])
      for (const r of [INNER, OUTER])
        for (const y of [-HALF_HEIGHT, HALF_HEIGHT])
          points.push(r * Math.cos(a), y, r * Math.sin(a))
    return new Float32Array(points)
  })
}

/** The ring's own hull: its outer rims (the bore is filled). */
function ringHull(): Float32Array {
  const points: number[] = []
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * 2 * Math.PI
    for (const y of [-HALF_HEIGHT, HALF_HEIGHT])
      points.push(OUTER * Math.cos(a), y, OUTER * Math.sin(a))
  }
  return new Float32Array(points)
}

function shaftInBore(collider: "hull" | "decomposed") {
  const m = mechanism()
  const ring = m.box("Ring", [OUTER, HALF_HEIGHT, OUTER], [0, 0, 0], { grounded: true, collider })
  // A 5 mm square shaft: its corners (3.54 mm out) clear the wedges' chords (3.92 mm).
  const shaft = m.box("Shaft", [2.5, 20, 2.5], [0, 0, 0], { collider: "box" })
  const hinge = m.mate(m.anchor(ring, [0, 0, 0], Y), m.anchor(shaft, [0, 0, 0], Y), "revolute", {
    contactsEnabled: true, // the shaft must not pass through the housing elsewhere
  })
  const geometry: ColliderGeometry = {
    points: (id) => (id === ring.assetId ? ringHull() : null),
    mesh: () => null,
    pieces: (id) => (id === ring.assetId ? ringPieces() : null),
  }
  return { sim: m.sim(RAPIER, geometry), ring, shaft, hinge }
}

describe("interference at the start of a run (PLAN 10.3, 10.9)", () => {
  it("convex pieces leave the bore open: no interference, and the shaft turns", () => {
    const { sim, shaft, hinge } = shaftInBore("decomposed")
    expect(sim.interferences).toEqual([])
    expect(
      sim.scene.bodies.get(sim.model.bodies[0]?.id ?? ("" as never))?.parts[0]?.colliders
    ).toHaveLength(WEDGES)
    sim.grab(shaft, [2.5, 15, 0])
    sim.moveTo([0, 15, 2.5]) // a quarter turn about Y (+X → +Z is −90° about +Y)
    sim.step(sim.seconds(1.5))
    expect(Math.abs(sim.coordinate(hinge))).toBeCloseTo(Math.PI / 2, 1)
    expect(Math.hypot(...sim.position(shaft))).toBeLessThan(0.05) // still centred in the bore
  })

  it("a hull fills the bore: the overlap is reported and its contacts are left out", () => {
    const { sim, ring, shaft, hinge } = shaftInBore("hull")
    expect(sim.interferences).toHaveLength(1)
    const [found] = sim.interferences
    expect(new Set([found?.a, found?.b])).toEqual(new Set([ring.id, shaft.id]))
    expect(found?.depthMm).toBeGreaterThan(2)
    // Without the filter the shaft would be shot out of the hull; with it, it turns calmly.
    sim.grab(shaft, [2.5, 15, 0])
    sim.moveTo([0, 15, 2.5])
    let fastest = 0
    sim.step(sim.seconds(1.5), () => {
      const v = sim.scene.bodies.get(shaft.id)?.body.linvel() ?? { x: 0, y: 0, z: 0 }
      fastest = Math.max(fastest, Math.hypot(v.x, v.y, v.z))
    })
    expect(Math.abs(sim.coordinate(hinge))).toBeCloseTo(Math.PI / 2, 1)
    expect(fastest).toBeLessThan(50)
  })

  it("parts that only touch, and hinged parts with contacts off, are not interference", () => {
    const m = mechanism()
    const base = m.box("Base", [20, 5, 20], [0, 0, 0], { grounded: true })
    m.box("Resting", [5, 5, 5], [0, 10, 0]) // face on face
    const arm = m.box("Arm", [20, 2, 2], [10, 0, 0]) // inside the base, hinged, contacts off
    m.mate(m.anchor(base, [0, 0, 0]), m.anchor(arm, [0, 0, 0]), "revolute")
    expect(m.sim(RAPIER).interferences).toEqual([])
  })
})
