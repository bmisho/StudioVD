import type { RigidBody } from "@dimforge/rapier3d-compat"
import { dampingForce, dampingTorque } from "@/core/physics/damping"
import {
  DRAG_SPRING,
  dragForce,
  effectiveMass,
  type DragSpringParams,
} from "@/core/physics/dragSpring"
import { add, cross, length, quatConjugate, quatMultiply, rotate, sub } from "@/core/physics/vec"
import type { Quat, Vec3 } from "@/core/schema"
import type { PhysicsBody, PhysicsScene } from "./buildPhysicsScene"

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

function applyDrag(drag: Drag, params: DragSpringParams): void {
  const { body } = drag.entry
  const grab = grabPoint(drag)
  const arm = sub(grab, vec(body.worldCom()))
  const velocity = add(vec(body.linvel()), cross(vec(body.angvel()), arm))
  const inertia = vec(body.principalInertia())
  const mass = effectiveMass(body.mass(), Math.min(...inertia), length(arm))
  const force = dragForce(grab, drag.targetMm, velocity, mass, params)
  body.addForceAtPoint(xyz(force), xyz(grab), true)
}

/**
 * Runs before every physics step (app: useBeforePhysicsStep; tests: before world.step()).
 * Forces persist in Rapier until reset, so each step starts from zero, then adds viscous
 * damping (released parts come to rest) and the drag spring. The dragged body gets no extra
 * damping: the spring is critically damped on its own and would otherwise lag the cursor.
 */
export function beforePhysicsStep(
  scene: PhysicsScene,
  drag: Drag | null,
  params: DragSpringParams = DRAG_SPRING
): void {
  for (const entry of scene.dynamic) {
    const { body } = entry
    if (body.isSleeping()) continue
    body.resetForces(false)
    body.resetTorques(false)
    if (drag?.entry !== entry) applyDamping(body)
  }
  if (drag) applyDrag(drag, params)
}
