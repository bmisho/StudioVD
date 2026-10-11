import type * as Rapier from "@dimforge/rapier3d-compat"
import type { RigidBody, World } from "@dimforge/rapier3d-compat"
import { splitJointTree } from "@/core/physics/jointTree"
import type { PhysicsJointModel, PhysicsModel } from "@/core/physics/physicsModel"
import { rotate, sub } from "@/core/physics/vec"
import type { PartId, Quat, Vec3 } from "@/core/schema"

/** The parts of the Rapier module the builder uses (the app passes useRapier().rapier). */
export type RapierApi = Pick<
  typeof Rapier,
  "World" | "RigidBodyDesc" | "ColliderDesc" | "JointData"
>

export interface PhysicsBody {
  partId: PartId
  body: RigidBody
  /** The part's design rotation, carried by its collider (the body starts unrotated). */
  designRotation: Quat
}

export interface PhysicsScene {
  bodies: ReadonlyMap<PartId, PhysicsBody>
  /** Bodies that can move (the step hooks iterate these). */
  dynamic: readonly PhysicsBody[]
}

const v = (a: Vec3) => ({ x: a[0], y: a[1], z: a[2] })
const q = (a: Quat) => ({ x: a[0], y: a[1], z: a[2], w: a[3] })

/**
 * Builds the Rapier bodies, colliders and joints for `model` into `world`.
 *
 * Every body starts with an IDENTITY rotation at its part's position; the part's rotation
 * goes on the collider. Rapier's JointData.revolute uses one local axis for BOTH bodies, so
 * two differently rotated bodies would snap into alignment on the first step (measured: a
 * 42-48° jump). With identity bodies, world axis = local axis on both sides, for any design
 * pose. The visual pose is then body pose ∘ design rotation (see partPose).
 */
export function buildPhysicsScene(rapier: RapierApi, world: World, model: PhysicsModel) {
  const bodies = new Map<PartId, PhysicsBody>()
  const dynamic: PhysicsBody[] = []
  for (const m of model.bodies) {
    const desc = m.grounded ? rapier.RigidBodyDesc.fixed() : rapier.RigidBodyDesc.dynamic()
    const body = world.createRigidBody(desc.setTranslation(...m.positionMm))
    const collider = rapier.ColliderDesc.cuboid(...m.box.halfExtentsMm)
      .setTranslation(...rotate(m.rotation, m.box.centerMm))
      .setRotation(q(m.rotation))
      .setDensity(m.densityKgMm3)
    if (!m.collides) collider.setCollisionGroups(0) // member of no group: touches nothing
    world.createCollider(collider, body)
    const entry: PhysicsBody = { partId: m.partId, body, designRotation: m.rotation }
    bodies.set(m.partId, entry)
    if (!m.grounded) dynamic.push(entry)
  }

  const position = (id: PartId): Vec3 => {
    const t = bodies.get(id)?.body.translation() ?? { x: 0, y: 0, z: 0 }
    return [t.x, t.y, t.z]
  }
  const jointData = (j: PhysicsJointModel, first: PartId, second: PartId) =>
    rapier.JointData.revolute(
      v(sub(j.pointMm, position(first))),
      v(sub(j.pointMm, position(second))),
      v(j.axis)
    )

  const forest = splitJointTree(
    model.bodies.map((b) => ({ id: b.partId, grounded: b.grounded })),
    model.joints.map((j) => ({ joint: j, a: j.partA, b: j.partB }))
  )
  for (const { joint, parent, child } of forest.tree) {
    const a = bodies.get(parent as PartId)?.body
    const b = bodies.get(child as PartId)?.body
    if (!a || !b) continue
    const data = jointData(joint, parent as PartId, child as PartId)
    world.createMultibodyJoint(data, a, b, true).setContactsEnabled(joint.contactsEnabled)
  }
  for (const joint of forest.loops) {
    const a = bodies.get(joint.partA)?.body
    const b = bodies.get(joint.partB)?.body
    if (!a || !b) continue
    const data = jointData(joint, joint.partA, joint.partB)
    world.createImpulseJoint(data, a, b, true).setContactsEnabled(joint.contactsEnabled)
  }
  return { bodies, dynamic } satisfies PhysicsScene
}

/** The part's world pose now: body pose ∘ design rotation. */
export function partPose(entry: PhysicsBody): { positionMm: Vec3; quaternion: Quat } {
  const t = entry.body.translation()
  const r = entry.body.rotation()
  const [x, y, z, w] = entry.designRotation
  // Hamilton product body·design, inlined (hot path: every part, every step).
  return {
    positionMm: [t.x, t.y, t.z],
    quaternion: [
      r.w * x + r.x * w + r.y * z - r.z * y,
      r.w * y - r.x * z + r.y * w + r.z * x,
      r.w * z + r.x * y - r.y * x + r.z * w,
      r.w * w - r.x * x - r.y * y - r.z * z,
    ],
  }
}
