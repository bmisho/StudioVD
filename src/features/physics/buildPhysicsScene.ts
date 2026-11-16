import type * as Rapier from "@dimforge/rapier3d-compat"
import type { Collider, ImpulseJoint, JointData, RigidBody, World } from "@dimforge/rapier3d-compat"
import { splitJointTree } from "@/core/physics/jointTree"
import type {
  PhysicsCouplingModel,
  PhysicsJointModel,
  PhysicsModel,
  PhysicsPartModel,
} from "@/core/physics/physicsModel"
import { add, rotate, sub } from "@/core/math/vec3"
import type { PartId, Quat, Vec3 } from "@/core/schema"
import { setRapierStop, softStopOf, usesRapierStop } from "./hingeLimits"
import { createPartColliders, NO_GEOMETRY, type ColliderGeometry } from "./partColliders"

/** The parts of the Rapier module the builder uses (the app passes useRapier().rapier). */
export type RapierApi = Pick<
  typeof Rapier,
  "World" | "RigidBodyDesc" | "ColliderDesc" | "JointData"
>

/** A rigid body of the run: one or more parts (joined by fixed mates) moving as one. */
export interface PhysicsBody {
  id: PartId
  body: RigidBody
  parts: readonly (Pick<PhysicsPartModel, "partId" | "offsetMm" | "rotation"> & {
    colliders: readonly Collider[]
  })[]
}

/** A joint of the run, with what reading its coordinate needs (`jointState.ts`). */
export interface PhysicsJoint {
  model: PhysicsJointModel
  a: PhysicsBody
  b: PhysicsBody
  /** The joint point in each body's own frame. */
  localA: Vec3
  localB: Vec3
  /** Whole turns counted so far, and the last twist read (a hinge can turn many times). */
  turns: number
  lastTwist: number
  /** Limits (from the design pose) our own stop holds a hinge to (`hingeLimits.ts`). */
  softStop?: [number, number]
}

export interface PhysicsCoupling {
  model: PhysicsCouplingModel
  a: PhysicsJoint
  b: PhysicsJoint
}

export interface PhysicsScene {
  /** Every part's body (parts of one rigid group share theirs). */
  bodies: ReadonlyMap<PartId, PhysicsBody>
  all: readonly PhysicsBody[]
  /** Bodies that can move (the step hooks iterate these). */
  dynamic: readonly PhysicsBody[]
  joints: readonly PhysicsJoint[]
  couplings: readonly PhysicsCoupling[]
}

const v = (a: Vec3) => ({ x: a[0], y: a[1], z: a[2] })

/**
 * The joint as Rapier takes it, between `first` and `second` (the tree's parent and child).
 * Limits are in the mate's coordinate (B relative to A, from where it was snapped): shifted
 * to start at the design pose, and mirrored when the tree runs from B to A.
 */
function jointData(
  rapier: RapierApi,
  j: PhysicsJointModel,
  first: Vec3,
  second: Vec3,
  aFirst: boolean
) {
  const [p1, p2] = [v(sub(j.pointMm, first)), v(sub(j.pointMm, second))]
  const { JointData } = rapier
  const data: JointData =
    j.type === "revolute"
      ? JointData.revolute(p1, p2, v(j.axis))
      : j.type === "prismatic"
        ? JointData.prismatic(p1, p2, v(j.axis))
        : JointData.spherical(p1, p2)
  // Rapier's JS build passes limits on only for sliders; hinges get theirs in `hingeLimits`.
  if (j.limits && j.type === "prismatic") {
    const [lo, hi] = [j.limits.min - j.zero, j.limits.max - j.zero]
    data.limitsEnabled = true
    data.limits = aFirst ? [lo, hi] : [-hi, -lo]
  }
  return data
}

/**
 * Builds the Rapier bodies, colliders and joints for `model` into `world` (PLAN 10.1).
 *
 * Every body starts with an IDENTITY rotation at its first part's position; each part's
 * rotation goes on its colliders. Rapier's JointData uses one local axis for BOTH bodies, so
 * two differently rotated bodies would snap into alignment on the first step (measured: a
 * 42-48° jump). With identity bodies, world axis = local axis on both sides, for any design
 * pose. A part's pose is then body pose ∘ its place in the body (see partPose).
 */
export function buildPhysicsScene(
  rapier: RapierApi,
  world: World,
  model: PhysicsModel,
  geometry: ColliderGeometry = NO_GEOMETRY
): PhysicsScene {
  const bodies = new Map<PartId, PhysicsBody>()
  const byId = new Map<PartId, PhysicsBody>()
  const all: PhysicsBody[] = []
  for (const m of model.bodies) {
    const desc = m.grounded ? rapier.RigidBodyDesc.fixed() : rapier.RigidBodyDesc.dynamic()
    const body = world.createRigidBody(desc.setTranslation(...m.positionMm))
    const parts = m.parts.map((p) => ({
      partId: p.partId,
      offsetMm: p.offsetMm,
      rotation: p.rotation,
      colliders: createPartColliders(rapier, world, body, p, geometry),
    }))
    // The colliders' masses were set after they were attached: Rapier would only take them
    // in at the next step, and the first drag force would be sized for the wrong mass.
    body.recomputeMassPropertiesFromColliders()
    const entry: PhysicsBody = { id: m.id, body, parts }
    all.push(entry)
    byId.set(m.id, entry)
    for (const p of m.parts) bodies.set(p.partId, entry)
  }
  const origin = new Map(model.bodies.map((b) => [b.id, b.positionMm]))
  const at = (id: PartId): Vec3 => origin.get(id) ?? [0, 0, 0]

  // Hinges Rapier stops itself stay out of the tree: only an impulse joint can carry limits.
  const forest = splitJointTree(
    model.bodies.map((b) => ({ id: b.id, grounded: b.grounded })),
    model.joints
      .filter((j) => !usesRapierStop(j))
      .map((j) => ({ joint: j, a: j.bodyA, b: j.bodyB }))
  )
  const joints = new Map<string, PhysicsJoint>()
  const track = (j: PhysicsJointModel, impulse?: ImpulseJoint) => {
    const [a, b] = [byId.get(j.bodyA), byId.get(j.bodyB)]
    if (!a || !b) return
    const [localA, localB] = [sub(j.pointMm, at(j.bodyA)), sub(j.pointMm, at(j.bodyB))]
    if (impulse && usesRapierStop(j)) setRapierStop(j, impulse)
    const softStop = softStopOf(j)
    const joint = { model: j, a, b, localA, localB, turns: 0, lastTwist: 0 }
    joints.set(j.mateId, softStop ? { ...joint, softStop } : joint)
  }
  for (const { joint, parent, child } of forest.tree) {
    const [a, b] = [byId.get(parent as PartId)?.body, byId.get(child as PartId)?.body]
    if (!a || !b) continue
    const first = parent === joint.bodyA
    const data = jointData(rapier, joint, at(parent as PartId), at(child as PartId), first)
    world.createMultibodyJoint(data, a, b, true).setContactsEnabled(joint.contactsEnabled)
    track(joint)
  }
  for (const joint of [...forest.loops, ...model.joints.filter(usesRapierStop)]) {
    const [a, b] = [byId.get(joint.bodyA)?.body, byId.get(joint.bodyB)?.body]
    if (!a || !b) continue
    const data = jointData(rapier, joint, at(joint.bodyA), at(joint.bodyB), true)
    const impulse = world.createImpulseJoint(data, a, b, true)
    impulse.setContactsEnabled(joint.contactsEnabled)
    track(joint, impulse)
  }
  const couplings = model.couplings.flatMap((c) => {
    const [a, b] = [joints.get(c.mateA), joints.get(c.mateB)]
    return a && b ? [{ model: c, a, b }] : []
  })
  const dynamic = all.filter((e) => e.body.isDynamic())
  return { bodies, all, dynamic, joints: [...joints.values()], couplings }
}

type PartInBody = Pick<PhysicsPartModel, "offsetMm" | "rotation">

/** A part's world pose now: its body's pose ∘ its place in the body. */
export function partPose(
  entry: PhysicsBody,
  part: PartInBody
): { positionMm: Vec3; quaternion: Quat } {
  const t = entry.body.translation()
  const r = entry.body.rotation()
  const [x, y, z, w] = part.rotation
  // Hamilton product body·part, inlined (hot path: every part, every step).
  return {
    positionMm: add([t.x, t.y, t.z], rotate([r.x, r.y, r.z, r.w], part.offsetMm)),
    quaternion: [
      r.w * x + r.x * w + r.y * z - r.z * y,
      r.w * y - r.x * z + r.y * w + r.z * x,
      r.w * z + r.x * y - r.y * x + r.z * w,
      r.w * w - r.x * x - r.y * y - r.z * z,
    ],
  }
}
