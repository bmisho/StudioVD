// @vitest-environment node
import RAPIER from "@dimforge/rapier3d-compat"
import { beforeAll, describe, expect, it } from "vitest"
import { prepareGenerated } from "@/core/generators/prepare"
import { findGenerator } from "@/core/generators/registry"
import { assetFromPrepared } from "@/core/library/assetRecords"
import { definitionOf } from "@/core/library/definition"
import { instantiateComponent } from "@/core/library/instantiate"
import { physicsModelFromDocument } from "@/core/physics/physicsModel"
import { mergeBatch } from "@/core/scene/entityBatch"
import { createEmptyDocument, type GeneratorParams, type SceneDocument } from "@/core/schema"
import { buildPhysicsScene } from "./buildPhysicsScene"
import type { ColliderGeometry } from "./partColliders"
import { configureWorld } from "./physicsConfig"
import { beforePhysicsStep, beginDrag } from "./physicsStep"

beforeAll(async () => {
  await RAPIER.init()
})

/** A generator run ready to insert, with each asset's vertices for its hull collider. */
async function component(id: string, params: GeneratorParams, hulls: Map<string, Float32Array>) {
  const gen = findGenerator(id, 1)
  if (!gen) throw new Error(id)
  const run = await prepareGenerated(gen, params)
  const assets = Object.fromEntries(
    Object.entries(run.assets).map(([key, a]) => {
      const mesh = run.output.bodies[key]?.mesh.positions ?? new Float32Array()
      const local = mesh.map((v, i) => v - (a.offsetMm[i % 3] ?? 0)) // as the asset is centred
      hulls.set(a.id, local)
      return [key, assetFromPrepared(a)]
    })
  )
  return { def: await definitionOf(run.manifest, "generator"), assets }
}

/**
 * PLAN 10.9: 200 parts made by the real generators: 50 bearings (outer ring grounded, the
 * inner one on its internal hinge: 100 parts, 50 joints) and 100 nuts loose above them,
 * every part with its convex hull.
 */
async function benchmarkAssembly(): Promise<{ doc: SceneDocument; geometry: ColliderGeometry }> {
  const hulls = new Map<string, Float32Array>()
  const bearing = await component(
    "bearing.deepGroove",
    { boreMm: 8, outerMm: 22, widthMm: 7, seal: "2RS" },
    hulls
  )
  const nut = await component("fastener.nut", { size: "M8" }, hulls)
  let doc = createEmptyDocument("0.1.0")
  const at = (x: number, y: number, z: number) => ({
    positionMm: [x, y, z] as [number, number, number],
    quaternion: [0, 0, 0, 1] as [number, number, number, number],
  })
  for (let i = 0; i < 50; i++) {
    const [x, z] = [40 * (i % 10), 40 * Math.floor(i / 10)]
    const placed = instantiateComponent(doc, { ...bearing, pose: at(x, 0, z) })
    doc = mergeBatch(doc, placed.batch)
    const outer = doc.components[placed.instance]?.parts.outer
    if (outer && doc.parts[outer])
      doc = { ...doc, parts: { ...doc.parts, [outer]: { ...doc.parts[outer], grounded: true } } }
    for (const y of [20, 35])
      doc = mergeBatch(doc, instantiateComponent(doc, { ...nut, pose: at(x, y, z) }).batch)
  }
  return {
    doc,
    geometry: { points: (id) => hulls.get(id) ?? null, mesh: () => null, pieces: () => null },
  }
}

describe("a 200-part assembly from generator parts (PLAN 10.9)", () => {
  it("builds one body per part, a hinge per bearing, and steps well inside a frame", async () => {
    const { doc, geometry } = await benchmarkAssembly()
    const model = physicsModelFromDocument(doc)
    expect(Object.keys(doc.parts)).toHaveLength(200)
    expect(model.bodies).toHaveLength(200)
    expect(model.joints).toHaveLength(50)
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
    configureWorld(world)
    const scene = buildPhysicsScene(RAPIER, world, model, geometry)
    expect(scene.all.every((b) => b.parts.every((p) => p.colliders.length === 1))).toBe(true)
    // A drag on one inner ring: what a user does while the rest sits still.
    const inner = scene.dynamic.find(
      (b) => b.parts[0]?.partId === Object.values(doc.components)[0]?.parts.inner
    )
    if (!inner) throw new Error("no inner ring")
    const spin = beginDrag(inner, [6, 7, 0])
    const step = () => {
      beforePhysicsStep(scene, spin)
      world.step()
    }
    for (let i = 0; i < 20; i++) step() // warm up: first contacts, JIT
    // The best of five 8-step batches (the unit suite runs files in parallel; see hubRig).
    const batches = Array.from({ length: 5 }, (_, k) => {
      spin.targetMm = [6 * Math.cos(k), 7, 6 * Math.sin(k)]
      const start = performance.now()
      for (let i = 0; i < 8; i++) step()
      return (performance.now() - start) / 8
    })
    const best = Math.min(...batches)
    console.info(`200-part step: ${best.toFixed(2)} ms (best of 5 batches)`)
    expect(best).toBeLessThan(8) // target 4 ms on a desktop; 1/120 s is the budget
    world.free()
  }, 120_000)
})
