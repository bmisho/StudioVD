import type { AssetId, CouplingId, MateId, PartId, Quat, Vec3 } from "@/core/schema"

/** How a part collides in test mode (PLAN 10.2). */
export type ColliderKind = "box" | "hull" | "decomposed" | "trimesh" | "none"

/** One part of a rigid body: where it sits in the body, its collision shape and its mass. */
export interface PhysicsPartModel {
  partId: PartId
  assetId: AssetId
  /** The part's origin relative to the body's, in world axes (the body starts unrotated). */
  offsetMm: Vec3
  /** The part's design rotation: carried by its collider, and by its pose in the body. */
  rotation: Quat
  /** The asset's bounds, part-local: the box collider, and the fallback of every other kind. */
  box: { centerMm: Vec3; halfExtentsMm: Vec3 }
  /** `trimesh` only on grounded bodies: a moving trimesh is hollow (a hull stands in). */
  collider: ColliderKind
  massKg: number
}

/**
 * A rigid body: the parts joined by fixed mates (PLAN §1 decision 5), moving as one. It
 * starts with an identity rotation at its first part's position.
 */
export interface PhysicsBodyModel {
  /** The first part's id. */
  id: PartId
  /** Design pose: where the body starts and where test mode resets to. */
  positionMm: Vec3
  grounded: boolean
  parts: PhysicsPartModel[]
}

export type JointType = "revolute" | "prismatic" | "spherical"

/** A joint in WORLD coordinates at the design pose. */
export interface PhysicsJointModel {
  mateId: MateId
  type: JointType
  /** The bodies of the mate's anchors A and B. */
  bodyA: PartId
  bodyB: PartId
  pointMm: Vec3
  /** Anchor A's z: the hinge axis, or the slide direction. */
  axis: Vec3
  /**
   * The mate's coordinate at the design pose: how far B is turned about (revolute, rad) or
   * moved along (prismatic, mm) A's z from where the mate was snapped. Spherical: 0.
   */
  zero: number
  /** In that coordinate (PLAN 8.1); test mode keeps to them. */
  limits?: { min: number; max: number }
  contactsEnabled: boolean
}

/**
 * Two joints moving together (PLAN 10.5): B's rate is `ratio` times A's (gear: rad per rad;
 * rack-pinion and lead screw: mm per rad). A belt is a gear coupling between its pulleys.
 */
export interface PhysicsCouplingModel {
  id: CouplingId | `belt:${string}`
  mateA: MateId
  mateB: MateId
  ratio: number
}

export interface PhysicsModel {
  bodies: PhysicsBodyModel[]
  joints: PhysicsJointModel[]
  couplings: PhysicsCouplingModel[]
}
