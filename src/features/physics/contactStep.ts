import type { World } from "@dimforge/rapier3d-compat"
import type { PartId } from "@/core/schema"
import type { PhysicsScene } from "./buildPhysicsScene"
import { contactReadings } from "./contactReadings"

/** Closer than this (mm) is touching; Rapier also reports predictive contacts further out. */
const TOUCH_MM = 0.5

const collidersOf = (scene: PhysicsScene, part: PartId) =>
  scene.bodies.get(part)?.parts.find((p) => p.partId === part)?.colliders ?? []

/** After a step: whether each pair bindings watch touches now (PLAN 13.1 contact source). */
export function readContacts(world: World, scene: PhysicsScene): void {
  for (const [a, b] of contactReadings.pairs()) {
    let touching = false
    for (const ca of collidersOf(scene, a))
      for (const cb of collidersOf(scene, b))
        world.contactPair(ca, cb, (manifold) => {
          for (let i = 0; i < manifold.numContacts(); i++)
            if (manifold.contactDist(i) <= TOUCH_MM) touching = true
        })
    contactReadings.write(a, b, touching)
  }
}
