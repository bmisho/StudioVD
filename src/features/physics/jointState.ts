import { twistAbout } from "@/core/physics/mateCoordinate"
import { add, cross, dot, quatConjugate, quatMultiply, rotate, sub } from "@/core/math/vec3"
import type { Quat, Vec3 } from "@/core/schema"
import type { PhysicsJoint } from "./buildPhysicsScene"

const vec = (p: { x: number; y: number; z: number }): Vec3 => [p.x, p.y, p.z]
const quat = (p: { x: number; y: number; z: number; w: number }): Quat => [p.x, p.y, p.z, p.w]

/** The joint's axis in world coordinates now (it rides on body A). */
export const jointAxisNow = (j: PhysicsJoint): Vec3 =>
  rotate(quat(j.a.body.rotation()), j.model.axis)

/** The joint point as each body carries it now. */
export function jointPointsNow(j: PhysicsJoint): [Vec3, Vec3] {
  const { a, b } = j
  return [
    add(vec(a.body.translation()), rotate(quat(a.body.rotation()), j.localA)),
    add(vec(b.body.translation()), rotate(quat(b.body.rotation()), j.localB)),
  ]
}

/**
 * The mate's coordinate now (PLAN 10.4, 10.8): B relative to A about (revolute, rad) or along
 * (prismatic, mm) the joint axis, counted from where the mate was snapped. A hinge is followed
 * across whole turns, so call it at least once every half turn (the app: every step).
 */
export function readJoint(j: PhysicsJoint): number {
  if (j.model.type === "spherical") return 0
  const qa = quat(j.a.body.rotation())
  if (j.model.type === "prismatic") {
    const [pa, pb] = jointPointsNow(j)
    return j.model.zero + dot(rotate(quatConjugate(qa), sub(pb, pa)), j.model.axis)
  }
  // Both bodies started unrotated: B's rotation in A's frame is what the hinge has turned.
  const twist = twistAbout(quatMultiply(quatConjugate(qa), quat(j.b.body.rotation())), j.model.axis)
  if (twist - j.lastTwist > Math.PI) j.turns--
  else if (twist - j.lastTwist < -Math.PI) j.turns++
  j.lastTwist = twist
  return j.model.zero + twist + 2 * Math.PI * j.turns
}

/** How fast the coordinate changes: rad/s about the axis, or mm/s along it. */
export function jointRate(j: PhysicsJoint): number {
  const axis = jointAxisNow(j)
  const { a, b } = j
  if (j.model.type === "revolute") return dot(sub(vec(b.body.angvel()), vec(a.body.angvel())), axis)
  if (j.model.type !== "prismatic") return 0
  const [pa, pb] = jointPointsNow(j)
  const at = (body: typeof a.body, p: Vec3) =>
    add(vec(body.linvel()), cross(vec(body.angvel()), sub(p, vec(body.worldCom()))))
  return dot(sub(at(b.body, pb), at(a.body, pa)), axis)
}
