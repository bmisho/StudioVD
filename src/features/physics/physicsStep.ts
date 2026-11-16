import type { RigidBody } from "@dimforge/rapier3d-compat"
import { dampingForce, dampingTorque } from "@/core/physics/damping"
import {
  DRAG_SPRING,
  dragAcceleration,
  pointForce,
  type DragSpringParams,
  type Sym3,
} from "@/core/physics/dragSpring"
import { add, cross, quatConjugate, quatMultiply, rotate, sub } from "@/core/math/vec3"
import type { Quat, Vec3 } from "@/core/schema"
import type { PhysicsBody, PhysicsScene } from "./buildPhysicsScene"
import { applyCouplings } from "./couplingStep"
import { applyHingeStops, type AppliedForce } from "./hingeLimits"
import { TIME_STEP_S } from "./physicsConfig"

const vec = (p: { x: number; y: number; z: number }): Vec3 => [p.x, p.y, p.z]
const quat = (p: { x: number; y: number; z: number; w: number }): Quat => [p.x, p.y, p.z, p.w]
const xyz = (a: Vec3) => ({ x: a[0], y: a[1], z: a[2] })

/** A body held by the mouse: where it was grabbed (body-local) and where the cursor is. */
export interface Drag {
  entry: PhysicsBody
  grabLocalMm: Vec3
  targetMm: Vec3
}

/** Starts a drag at the world point where the body was hit; the target starts there too. */
export function beginDrag(entry: PhysicsBody, grabWorldMm: Vec3): Drag {
  const { body } = entry
  const local = rotate(
    quatConjugate(quat(body.rotation())),
    sub(grabWorldMm, vec(body.translation()))
  )
  return { entry, grabLocalMm: local, targetMm: grabWorldMm }
}

/** World position of the grab point now. */
export function grabPoint(drag: Drag): Vec3 {
  const { body } = drag.entry
  return add(vec(body.translation()), rotate(quat(body.rotation()), drag.grabLocalMm))
}

function applyDamping(body: RigidBody): void {
  body.addForce(xyz(dampingForce(body.mass(), vec(body.linvel()))), false)
  const axes = quatMultiply(quat(body.rotation()), quat(body.principalInertiaLocalFrame()))
  body.addTorque(xyz(dampingTorque(vec(body.principalInertia()), axes, vec(body.angvel()))), false)
}

function applyDrag(drag: Drag, params: DragSpringParams): AppliedForce {
  const { body } = drag.entry
  const grab = grabPoint(drag)
  const arm = sub(grab, vec(body.worldCom()))
  const velocity = add(vec(body.linvel()), cross(vec(body.angvel()), arm))
  const w = body.effectiveWorldInvInertia()
  const mobility: Sym3 = [w.m11, w.m12, w.m13, w.m22, w.m23, w.m33]
  const accel = dragAcceleration(grab, drag.targetMm, velocity, params)
  const force = pointForce(body.mass(), mobility, arm, accel)
  body.addForceAtPoint(xyz(force), xyz(grab), true)
  return { body, pointMm: grab, force }
}

/**
 * Runs before every physics step (app: useBeforePhysicsStep; tests: before world.step()).
 * Forces persist in Rapier until reset, so each step starts from zero, then adds viscous
 * damping (released parts come to rest), the drag spring and the couplings. The dragged body
 * gets no extra damping: the spring is critically damped on its own and would otherwise lag
 * the cursor.
 */
export function beforePhysicsStep(
  scene: PhysicsScene,
  drag: Drag | null,
  params: DragSpringParams = DRAG_SPRING,
  dt: number = TIME_STEP_S
): void {
  for (const entry of scene.dynamic) {
    const { body } = entry
    // Asleep or not: a coupling may push a sleeping body, on top of nothing stale.
    body.resetForces(false)
    body.resetTorques(false)
    if (!body.isSleeping() && drag?.entry !== entry) applyDamping(body)
  }
  const pull = drag ? applyDrag(drag, params) : null
  // After the resets: coupled joints share the forces just applied (and wake each other).
  if (scene.couplings.length > 0) applyCouplings(scene.couplings, dt)
  applyHingeStops(scene.joints, dt, pull)
}
