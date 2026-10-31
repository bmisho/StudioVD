// @vitest-environment node
import RAPIER from "@dimforge/rapier3d-compat"
import { beforeAll, describe, expect, it } from "vitest"
import { anchor, mate, part } from "@/core/assembly/testing/mateFixtures"
import { physicsModelFromDocument } from "@/core/physics/physicsModel"
import { createTestRig } from "@/core/scene/testRig"
import { createEmptyDocument, type SceneDocument, type Vec3 } from "@/core/schema"
import { buildPhysicsScene } from "./buildPhysicsScene"
import { configureWorld } from "./physicsConfig"

beforeAll(async () => {
  await RAPIER.init()
})

/** `n` boxes (the rig's leaf asset) hinged around one grounded hub, every mate held. */
function hubDocument(n: number): SceneDocument {
  const doc = createEmptyDocument("0.0.0")
  const asset = createTestRig().assets[1]
  if (!asset) throw new Error("rig incomplete")
  const hub = part("Hub", true)
  doc.assets[hub.assetId] = { ...asset, id: hub.assetId }
  doc.parts[hub.id] = hub
  for (let i = 0; i < n; i++) {
    const turn = (i / n) * 2 * Math.PI
    const at: Vec3 = [400 * Math.cos(turn), 400 * Math.sin(turn), 0]
    const spoke = part(`Spoke ${i}`, false, { positionMm: at, quaternion: [0, 0, 0, 1] })
    const pin: Vec3 = [at[0] / 2, at[1] / 2, 0]
    const a = anchor(hub, pin)
    const b = anchor(spoke, [pin[0] - at[0], pin[1] - at[1], 0])
    const m = mate(a, b)
    doc.parts[spoke.id] = spoke
    doc.anchors[a.id] = a
    doc.anchors[b.id] = b
    doc.mates[m.id] = m
  }
  return doc
}

// Security review: 135 parts hinged to one hub made one multibody that trapped Rapier (WASM
// `unreachable` on the second step); 100 took 64 ms a step, and test mode owes 2 a frame.
describe("a hub with 150 hinged parts", () => {
  it("steps without a trap, well inside a frame", () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
    configureWorld(world)
    buildPhysicsScene(RAPIER, world, physicsModelFromDocument(hubDocument(150)))
    world.step()
    // The best of five 4-step batches: the unit suite runs files in parallel, and a mean over
    // all steps measured the other workers too (CI: 8.3 and 9.3 ms against ~3 ms alone). The
    // failure this guards (one 100+ link multibody: 64 ms a step) fails every batch.
    const batches = Array.from({ length: 5 }, () => {
      const start = performance.now()
      for (let i = 0; i < 4; i++) world.step()
      return (performance.now() - start) / 4
    })
    expect(Math.min(...batches)).toBeLessThan(8) // ~3 ms here, 1/120 s budget
    world.free()
  }, 60_000)
})
