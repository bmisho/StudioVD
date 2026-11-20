import type { Collider } from "@dimforge/rapier3d-compat"
import { add, length, rotate } from "@/core/math/vec3"
import type { PartId, Vec3 } from "@/core/schema"
import type { PhysicsBody, PhysicsScene } from "./buildPhysicsScene"

/** Deeper than this (mm) counts as interference; Rapier itself allows 0.01 mm. */
export const INTERFERENCE_TOLERANCE_MM = 0.05

/** Two parts that overlap where the run starts. */
export interface Interference {
  a: PartId
  b: PartId
  depthMm: number
}

/** Rapier's SolverFlags (numbers, so this module never loads the WASM module itself). */
const SOLVER_EMPTY = 0
const SOLVER_COMPUTE_IMPULSE = 1
/** ActiveHooks.FILTER_CONTACT_PAIRS. */
const FILTER_CONTACT_PAIRS = 1

const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`)

type Placed = PhysicsBody["parts"][number] & { entry: PhysicsBody; centre: Vec3; radius: number }

function placed(entry: PhysicsBody): Placed[] {
  const t = entry.body.translation()
  return entry.parts
    .filter((p) => p.colliders.some((c) => c.collisionGroups() !== 0))
    .map((p) => ({
      ...p,
      entry,
      centre: add(add([t.x, t.y, t.z], p.offsetMm), rotate(p.rotation, p.box.centerMm)),
      radius: length(p.box.halfExtentsMm),
    }))
}

/**
 * Pairs of parts on different bodies that overlap at the start of a run (PLAN 10.3), the
 * deepest overlap of each: zero-clearance CAD fits (a shaft modelled exactly in its bore)
 * would otherwise fly apart on the first step. Bodies whose joint has contacts off never
 * touch anyway and are not listed. Pruned by bounding spheres, then exact between colliders.
 */
export function scanInterference(
  scene: PhysicsScene,
  toleranceMm = INTERFERENCE_TOLERANCE_MM
): Interference[] {
  const quiet = new Set(
    scene.joints
      .filter((j) => !j.model.contactsEnabled)
      .map((j) => pairKey(j.a.body.handle, j.b.body.handle))
  )
  const parts = scene.all.flatMap(placed)
  const found: Interference[] = []
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (!p) continue
    for (let k = i + 1; k < parts.length; k++) {
      const q = parts[k]
      if (!q || q.entry === p.entry) continue
      if (!p.entry.body.isDynamic() && !q.entry.body.isDynamic()) continue
      if (quiet.has(pairKey(p.entry.body.handle, q.entry.body.handle))) continue
      const gap = length([
        q.centre[0] - p.centre[0],
        q.centre[1] - p.centre[1],
        q.centre[2] - p.centre[2],
      ])
      if (gap > p.radius + q.radius) continue
      const depth = deepest(p.colliders, q.colliders)
      if (depth > toleranceMm) found.push({ a: p.partId, b: q.partId, depthMm: depth })
    }
  }
  return found.sort((x, y) => y.depthMm - x.depthMm)
}

function deepest(a: readonly Collider[], b: readonly Collider[]): number {
  let depth = 0
  for (const ca of a)
    for (const cb of b) {
      if (ca.collisionGroups() === 0 || cb.collisionGroups() === 0) continue
      const contact = ca.contactCollider(cb, 0)
      if (contact && -contact.distance > depth) depth = -contact.distance
    }
  return depth
}

/** What the contact filter needs: the body pairs whose contacts this run ignores. */
export interface ContactFilter {
  filterContactPair: (c1: number, c2: number, b1: number, b2: number) => number | null
  filterIntersectionPair: (c1: number, c2: number, b1: number, b2: number) => boolean
}

/**
 * Leaves the interfering pairs' contacts out of this run (PLAN 10.3), through Rapier's
 * contact-pair hook: it is asked only about colliders flagged for it, so only those of
 * interfering bodies are; every other pair is solved as usual. Rapier's JS `world.step`
 * uses hooks only together with an event queue (react-three-rapier always passes one).
 */
export function ignoreInterference(
  scene: PhysicsScene,
  found: readonly Interference[]
): ContactFilter {
  const blocked = new Set<string>()
  for (const { a, b } of found) {
    const [ea, eb] = [scene.bodies.get(a), scene.bodies.get(b)]
    if (!ea || !eb) continue
    blocked.add(pairKey(ea.body.handle, eb.body.handle))
    for (const entry of [ea, eb])
      for (const p of entry.parts)
        for (const c of p.colliders) c.setActiveHooks(FILTER_CONTACT_PAIRS)
  }
  return {
    filterContactPair: (_c1, _c2, b1, b2) =>
      blocked.has(pairKey(b1, b2)) ? SOLVER_EMPTY : SOLVER_COMPUTE_IMPULSE,
    filterIntersectionPair: () => true,
  }
}
