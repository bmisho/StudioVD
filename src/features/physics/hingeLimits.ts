import type { ImpulseJoint, RigidBody } from "@dimforge/rapier3d-compat"
import type { PhysicsJointModel } from "@/core/physics/physicsModel"
import { cross, dot, quatMultiply, rotate, scale, sub } from "@/core/math/vec3"
import type { Quat, Vec3 } from "@/core/schema"
import type { PhysicsJoint } from "./buildPhysicsScene"
import { jointAxisNow, jointPointsNow, jointRate, readJoint } from "./jointState"

/**
 * Hinge limits (PLAN 10.1). Rapier 0.19.2's JS build can limit a hinge only on an impulse
 * joint (`setLimits`): `JointData` drops a hinge's limits, a multibody hinge has no setter,
 * and an impulse hinge beside a multibody one on the same two bodies locks them (measured:
 * it does not turn at all). Its angle is also measured within half a turn of the design pose
 * (sin θ/2), so a limit further away than that cannot be told from a nearer one.
 *
 * - Both limits within reach: the hinge is an impulse joint with Rapier's own stop (hard:
 *   about 0.6° under the strongest drag), outside the multibody tree.
 * - Otherwise (a knob with 300° of travel): it keeps its exact multibody joint and gets a
 *   stop of ours, `applyHingeStops`.
 */
const REACH_RAD = Math.PI - 0.05

const designLimits = (j: PhysicsJointModel): [number, number] | null =>
  j.type === "revolute" && j.limits ? [j.limits.min - j.zero, j.limits.max - j.zero] : null

/** A limited hinge Rapier can stop itself: an impulse joint, never a multibody one. */
export function usesRapierStop(j: PhysicsJointModel): boolean {
  const limits = designLimits(j)
  return limits !== null && Math.abs(limits[0]) <= REACH_RAD && Math.abs(limits[1]) <= REACH_RAD
}

/** The limits a hinge is held to by our own stop, counted from the design pose; else null. */
export const softStopOf = (j: PhysicsJointModel): [number, number] | null =>
  usesRapierStop(j) ? null : designLimits(j)

/** Sets Rapier's stop on `joint` (created from body A to body B). */
export function setRapierStop(j: PhysicsJointModel, joint: ImpulseJoint): void {
  const limits = designLimits(j)
  const limited: object = joint
  if (limits && "setLimits" in limited && typeof limited.setLimits === "function")
    (limited.setLimits as (min: number, max: number) => void)(limits[0], limits[1])
}

const vec = (p: { x: number; y: number; z: number }): Vec3 => [p.x, p.y, p.z]
const quat = (p: { x: number; y: number; z: number; w: number }): Quat => [p.x, p.y, p.z, p.w]
const xyz = (a: Vec3) => ({ x: a[0], y: a[1], z: a[2] })

/** The body's inertia about `axis` through `point` (parallel-axis); ∞ when it cannot move. */
function hingeInertia(body: RigidBody, axis: Vec3, point: Vec3): number {
  if (!body.isDynamic()) return Infinity
  const frame = quatMultiply(quat(body.rotation()), quat(body.principalInertiaLocalFrame()))
  const principal = vec(body.principalInertia())
  const units: Vec3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]
  const about = units.reduce(
    (sum, e, k) => sum + (principal[k] ?? 0) * dot(axis, rotate(frame, e)) ** 2,
    0
  )
  const arm = cross(sub(vec(body.worldCom()), point), axis)
  return about + body.mass() * dot(arm, arm)
}

/** A force we add this step ourselves (the drag): the stop counts on it. */
export interface AppliedForce {
  body: RigidBody
  pointMm: Vec3
  force: Vec3
}

/** Fastest return from beyond a limit (rad/s): a hinge found far past it comes back gently. */
const MAX_RETURN_RAD_S = 10

/**
 * Our stop for hinges whose limits Rapier cannot see: before every step, a hinge that would
 * pass a limit within the step gets the torque that leaves it exactly there,
 * $\tau = -(\dot\theta - \dot\theta_{allowed})\,/\,(W\,\Delta t)$ with
 * $\dot\theta_{allowed} = (\theta_{limit}-\theta)/\Delta t$ and W the hinge's mobility
 * (each body turning about the hinge axis). The rate includes what the drag adds this step.
 */
export function applyHingeStops(
  joints: readonly PhysicsJoint[],
  dt: number,
  applied: AppliedForce | null
): void {
  for (const j of joints) {
    if (!j.softStop) continue
    const [lo, hi] = j.softStop
    const theta = readJoint(j) - j.model.zero
    const axis = jointAxisNow(j)
    const [pa, pb] = jointPointsNow(j)
    const [ia, ib] = [hingeInertia(j.a.body, axis, pa), hingeInertia(j.b.body, axis, pb)]
    const mobility = 1 / ia + 1 / ib
    if (!(mobility > 0)) continue
    let rate = jointRate(j)
    if (applied) {
      const torque = (about: Vec3) => dot(cross(sub(applied.pointMm, about), applied.force), axis)
      if (applied.body.handle === j.b.body.handle) rate += (torque(pb) / ib) * dt
      else if (applied.body.handle === j.a.body.handle) rate -= (torque(pa) / ia) * dt
    }
    const [most, least] = [(hi - theta) / dt, (lo - theta) / dt]
    const allowed = Math.max(
      Math.min(rate, Math.max(most, -MAX_RETURN_RAD_S)),
      Math.min(least, MAX_RETURN_RAD_S)
    )
    if (allowed === rate) continue
    const torque = (allowed - rate) / (mobility * dt)
    j.b.body.addTorque(xyz(scale(axis, torque)), true)
    j.a.body.addTorque(xyz(scale(axis, -torque)), true)
  }
}
