import type { World } from "@dimforge/rapier3d-compat"
import { physicsModelFromDocument } from "@/core/physics/physicsModel"
import { add, dot, quatMultiply, rotate, sub } from "@/core/math/vec3"
import { createTestRig, TEST_RIG_HINGE_MM, TEST_RIG_LEAF } from "@/core/scene/testRig"
import { createEmptyDocument, type Quat, type SceneDocument, type Vec3 } from "@/core/schema"
import { buildPhysicsScene, type PhysicsBody, type RapierApi } from "../buildPhysicsScene"
import { configureWorld, TIME_STEP_S } from "../physicsConfig"
import { beforePhysicsStep, beginDrag, grabPoint, type Drag } from "../physicsStep"

/**
 * Headless test rig (PLAN 3.11): the real document -> model -> Rapier path the app uses,
 * stepped without a renderer. `frame` places the whole rig (any rotation, about the origin);
 * `leafLiftRad` additionally swings the leaf about its hinge in the design pose, so the two
 * bodies start with different rotations.
 */
export interface RigOptions {
  frame?: Quat
  leafLiftRad?: number
}

const IDENTITY: Quat = [0, 0, 0, 1]

export function rigDocument({ frame = IDENTITY, leafLiftRad = 0 }: RigOptions = {}) {
  const doc: SceneDocument = createEmptyDocument("0.0.0")
  const rig = createTestRig()
  const [base, leaf] = rig.parts
  if (!base || !leaf) throw new Error("test rig incomplete")
  const lift: Quat = [0, 0, Math.sin(leafLiftRad / 2), Math.cos(leafLiftRad / 2)]
  const leafCenter = add(
    TEST_RIG_HINGE_MM,
    rotate(lift, sub(TEST_RIG_LEAF.centerMm, TEST_RIG_HINGE_MM))
  )
  leaf.pose = { positionMm: rotate(frame, leafCenter), quaternion: quatMultiply(frame, lift) }
  base.pose = { positionMm: rotate(frame, base.pose.positionMm), quaternion: frame }
  for (const a of rig.assets) doc.assets[a.id] = a
  for (const p of rig.parts) doc.parts[p.id] = p
  for (const a of rig.anchors) doc.anchors[a.id] = a
  for (const m of rig.mates) doc.mates[m.id] = m
  return { doc, baseId: base.id, leafId: leaf.id }
}

export function createRigSim(rapier: RapierApi, options: RigOptions = {}) {
  const frame = options.frame ?? IDENTITY
  const { doc, leafId } = rigDocument(options)
  const world: World = new rapier.World({ x: 0, y: 0, z: 0 })
  configureWorld(world)
  const scene = buildPhysicsScene(rapier, world, physicsModelFromDocument(doc))
  const leaf = scene.bodies.get(leafId)
  if (!leaf) throw new Error("leaf body missing")
  const hinge = rotate(frame, TEST_RIG_HINGE_MM)
  const axis = rotate(frame, [0, 0, 1])
  const t0 = leaf.body.translation()
  const hingeLocal = sub(hinge, [t0.x, t0.y, t0.z]) // leaf body starts unrotated
  let drag: Drag | null = null

  return {
    world,
    scene,
    leaf,
    frame,
    /** The rig's own coordinates (as in testRig.ts) -> world. */
    toWorld: (p: Vec3) => rotate(frame, p),
    grab: (pointMm: Vec3) => {
      drag = beginDrag(leaf, pointMm)
    },
    moveTo: (targetMm: Vec3) => {
      if (drag) drag.targetMm = targetMm
    },
    release: () => {
      drag = null
    },
    grabPoint: () => (drag ? grabPoint(drag) : null),
    step: () => {
      beforePhysicsStep(scene, drag)
      world.step()
    },
    /** Leaf rotation about the hinge axis since the design pose, radians (+ = lifting). */
    leafAngle: () => {
      const r = leaf.body.rotation()
      return 2 * Math.atan2(dot([r.x, r.y, r.z], axis), r.w)
    },
    /** Distance between the hinge point as carried by the leaf and the fixed base point. */
    hingeSeparation: () => {
      const t = leaf.body.translation()
      const r = leaf.body.rotation()
      const carried = add([t.x, t.y, t.z], rotate([r.x, r.y, r.z, r.w], hingeLocal))
      return Math.hypot(...sub(carried, hinge))
    },
    /** Upper bound on the speed of any leaf point, mm/s (it lies within 43 mm of its centre). */
    leafMaxSpeed: () => leafSpeed(leaf),
    seconds: (s: number) => Math.round(s / TIME_STEP_S),
  }
}

function leafSpeed({ body }: PhysicsBody): number {
  const v = body.linvel()
  const w = body.angvel()
  return Math.hypot(v.x, v.y, v.z) + Math.hypot(w.x, w.y, w.z) * 43
}
