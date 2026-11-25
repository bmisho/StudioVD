import { beforeEach, describe, expect, it, vi } from "vitest"
import { cableLayout } from "@/core/connectors/cableMesh"
import { connectorFrames } from "@/core/connectors/frames"
import { prepareGenerated } from "@/core/generators/prepare"
import { findGenerator } from "@/core/generators/registry"
import { checkIntegrity, type GeneratorParams } from "@/core/schema"
import { ok } from "@/lib/tauri/result"
import { useDocumentStore } from "@/store/document/documentStore"
import { resetStores } from "@/test/resetStores"
import { guitarPedal } from "./guitarPedal"

// Generators run in-process here (the app runs them in a worker); nothing is written.
vi.mock("@/features/library/generatorClient", () => ({
  generateComponent: (id: string, major: number, params: GeneratorParams) => {
    const generator = findGenerator(id, major)
    if (!generator) throw new Error(`no ${id}`)
    return prepareGenerated(generator, params)
  },
}))
vi.mock("@/lib/tauri/files", () => ({ writeAsset: () => Promise.resolve(ok(true)) }))
vi.mock("@/lib/tauri/library", () => ({
  copyComponentIntoProject: () => Promise.resolve(ok(0)),
}))

const doc = () => useDocumentStore.getState().doc
const groupNamed = (name: string) => Object.values(doc().groups).find((g) => g.name === name)
const partsIn = (name: string) =>
  Object.values(doc().parts).filter((p) => p.parentId === groupNamed(name)?.id)

describe("Help › Examples › Guitar pedal (PLAN 16.6)", () => {
  beforeEach(resetStores)

  it("builds a valid document: parts, mates, cables, circuit and bindings", async () => {
    await guitarPedal()
    const d = doc()
    expect(checkIntegrity(d)).toEqual([])
    expect(Object.keys(d.parts)).toHaveLength(21) // the footswitch's plunger is a part of its own
    const cables = Object.values(d.connectors).filter((c) => c.kind === "cable")
    expect(cables.map((c) => c.name)).toContain("Battery +")
    expect(cables).toHaveLength(16)
    // Footswitch, battery, Volume, Gain, Tone, resistor, LED and three grounds (0.2.2).
    expect(Object.keys(d.schematic.nodes)).toHaveLength(10)
    // Three knobs and the footswitch in; the LED's glow out.
    expect(Object.keys(d.bindings)).toHaveLength(5)
  }, 30_000)

  it("puts the knobs above the top panel and the battery on the base plate", async () => {
    await guitarPedal()
    for (const name of ["Gain knob", "Tone knob", "Volume knob"])
      for (const p of partsIn(name)) expect(p.pose.positionMm[1], name).toBeGreaterThan(40)
    const housing = partsIn("Volume pot").find((p) => p.name === "Housing")
    expect(housing?.pose.positionMm[1]).toBeLessThan(40)
  }, 30_000)

  it("cuts every cable to its route plus spare, laid inside the box", async () => {
    await guitarPedal()
    const inside = { x: 57.5, yMin: 2, yMax: 37.5, z: 44.5 }
    const leaving: string[] = []
    for (const c of Object.values(doc().connectors)) {
      if (c.kind !== "cable") continue
      const frames = connectorFrames(doc(), c)
      const laid = frames && cableLayout(c, frames)
      if (!laid) throw new Error(`${c.name} has no route`)
      expect(laid.shortMm, c.name).toBe(0)
      expect(laid.spareMm, c.name).toBeGreaterThan(0)
      const r = c.outerMm / 2
      const outside = laid.points.filter(
        ([x, y, z]) =>
          Math.abs(x) > inside.x - r ||
          y < inside.yMin + r ||
          y > inside.yMax - r ||
          Math.abs(z) > inside.z - r
      )
      const [first] = outside
      if (first) leaving.push(`${c.name} ×${outside.length} at ${first.map(Math.round).join(", ")}`)
    }
    expect(leaving).toEqual([])
  }, 30_000)
})
