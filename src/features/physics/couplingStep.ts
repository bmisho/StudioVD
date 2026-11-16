import type { RigidBody } from "@dimforge/rapier3d-compat"
import { dot, scale } from "@/core/math/vec3"
import type { Vec3 } from "@/core/schema"
import type { PhysicsCoupling, PhysicsJoint } from "./buildPhysicsScene"
import { jointAxisNow, jointRate, readJoint } from "./jointState"

/**
 * How much of the rate error one step removes. The mobilities below are those of free
 * bodies, an upper bound on a mounted body's (constraints only add inertia), so the
 * correction undershoots: 0.8 leaves margin and still settles within a few steps.
 */
export const COUPLING_GAIN = 0.8
/** Share of the accumulated position error fed back per step (Baumgarte): no drift. */
export const COUPLING_DRIFT_GAIN = 0.2

const xyz = (a: Vec3) => ({ x: a[0], y: a[1], z: a[2] })

/** 1/inertia about `axis` (revolute) or 1/mass (prismatic) of one body; 0 when it is fixed. */
function mobility(body: RigidBody, axis: Vec3, turning: boolean): number {
  if (!body.isDynamic()) return 0
  if (!turning) return body.invMass()
  const w = body.effectiveWorldInvInertia()
  const [x, y, z] = axis
  return (
    w.m11 * x * x +
    w.m22 * y * y +
    w.m33 * z * z +
    2 * (w.m12 * x * y + w.m13 * x * z + w.m23 * y * z)
  )
}

/** A joint's mobility along its own coordinate: both bodies react to a force between them. */
function jointMobility(j: PhysicsJoint, axis: Vec3): number {
  const turning = j.model.type === "revolute"
  return mobility(j.a.body, axis, turning) + mobility(j.b.body, axis, turning)
}

/** A generalized force on the joint's coordinate: +f on B, −f on A, about or along the axis. */
function push(j: PhysicsJoint, axis: Vec3, f: number): void {
  const [onB, onA] = [xyz(scale(axis, f)), xyz(scale(axis, -f))]
  if (j.model.type === "revolute") {
    j.b.body.addTorque(onB, true)
    j.a.body.addTorque(onA, true)
  } else {
    j.b.body.addForce(onB, true)
    j.a.body.addForce(onA, true)
  }
}

/**
 * Couplings (PLAN 10.5): gear pairs, rack and pinion, lead screws and belts keep
 * $\dot q_B = r\,\dot q_A$. Rapier has no such constraint between joints, so before every
 * step the rate error $C = \dot q_B - r\,\dot q_A$ (plus a share of the position drift) is
 * removed by a pair of forces along the two joint coordinates, sized as the impulse that
 * cancels it: $\lambda = C / (W_B + r^2 W_A)$, applied as $-\lambda/\Delta t$ on B's coordinate
 * and $+r\lambda/\Delta t$ on A's ($W$: the joints' mobilities). Forces, not velocity edits:
 * Rapier derives the velocities of multibody links itself.
 */
export function applyCouplings(couplings: readonly PhysicsCoupling[], dt: number): void {
  for (const c of couplings) {
    const r = c.model.ratio
    const [axisA, axisB] = [jointAxisNow(c.a), jointAxisNow(c.b)]
    const w = jointMobility(c.b, axisB) + r * r * jointMobility(c.a, axisA)
    if (!(w > 0)) continue
    const drift = readJoint(c.b) - c.b.model.zero - r * (readJoint(c.a) - c.a.model.zero)
    const error = jointRate(c.b) - r * jointRate(c.a) + (COUPLING_DRIFT_GAIN * drift) / dt
    const lambda = (COUPLING_GAIN * error) / w / dt
    push(c.b, axisB, -lambda)
    push(c.a, axisA, r * lambda)
  }
}

/** For tests and readouts: how far a coupling is off, in B's coordinate. */
export function couplingError(c: PhysicsCoupling): number {
  const r = c.model.ratio
  return readJoint(c.b) - c.b.model.zero - r * (readJoint(c.a) - c.a.model.zero)
}

export const _mobilityForTest = (body: RigidBody, axis: Vec3) =>
  dot(axis, axis) > 0 ? mobility(body, axis, true) : 0
