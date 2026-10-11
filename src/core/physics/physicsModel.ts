import type { MateId, PartId, Quat, SceneDocument, Vec3 } from "@/core/schema"
import { densityKgM3ToKgMm3 } from "@/core/units"
import { add, length, rotate, scale } from "./vec"

/** Density for parts without a material: structural steel, 7850 kg/m³ (EN 10025, nominal). */
export const DEFAULT_DENSITY_KG_M3 = 7850

/** One rigid body per part (Phase 10 merges fixed-mated parts into compound bodies). */
export interface PhysicsBodyModel {
  partId: PartId
  /** Design pose: where the body starts and where test mode resets to. */
  positionMm: Vec3
  rotation: Quat
  grounded: boolean
  /** Phase 3: a box from the asset bounds, in part-local coordinates. Also gives the mass. */
  box: { centerMm: Vec3; halfExtentsMm: Vec3 }
  /** False for `collider: "none"`: the part keeps its mass but touches nothing. */
  collides: boolean
  densityKgMm3: number
}

/** A joint in WORLD coordinates at the design pose. */
export interface PhysicsJointModel {
  mateId: MateId
  type: "revolute"
  partA: PartId
  partB: PartId
  pointMm: Vec3
  axis: Vec3
  contactsEnabled: boolean
}

export interface PhysicsModel {
  bodies: PhysicsBodyModel[]
  joints: PhysicsJointModel[]
}

type ModelSource = Pick<SceneDocument, "parts" | "assets" | "materials" | "anchors" | "mates">

/**
 * What test mode simulates, derived from the document. Hidden parts and parts without a
 * known asset are left out; suppressed mates, mates whose parts are missing and mate types
 * the spike does not build yet (fixed, prismatic, spherical: Phase 10) are skipped.
 */
export function physicsModelFromDocument(doc: ModelSource): PhysicsModel {
  const bodies: PhysicsBodyModel[] = []
  for (const part of Object.values(doc.parts)) {
    const asset = Object.hasOwn(doc.assets, part.assetId) ? doc.assets[part.assetId] : undefined
    if (!asset || !part.visible) continue
    const { min, max } = asset.bboxMm
    const material =
      part.materialId !== null && Object.hasOwn(doc.materials, part.materialId)
        ? doc.materials[part.materialId]
        : undefined
    bodies.push({
      partId: part.id,
      positionMm: [...part.pose.positionMm],
      rotation: [...part.pose.quaternion],
      grounded: part.grounded,
      box: {
        centerMm: scale(add(min, max), 0.5),
        halfExtentsMm: [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2],
      },
      collides: part.collider !== "none",
      densityKgMm3: densityKgM3ToKgMm3(material?.densityKgM3 ?? DEFAULT_DENSITY_KG_M3),
    })
  }

  const present = new Map(bodies.map((b) => [b.partId, b]))
  const joints: PhysicsJointModel[] = []
  for (const mate of Object.values(doc.mates)) {
    if (mate.suppressed || mate.type !== "revolute") continue
    const a = Object.hasOwn(doc.anchors, mate.anchorA) ? doc.anchors[mate.anchorA] : undefined
    const b = Object.hasOwn(doc.anchors, mate.anchorB) ? doc.anchors[mate.anchorB] : undefined
    const bodyA = a && present.get(a.partId)
    const bodyB = b && present.get(b.partId)
    if (!a || !b || !bodyA || !bodyB || bodyA === bodyB) continue
    // The joint lives where anchor A is; Phase 8 snapping makes anchor B coincide with it.
    const axis = rotate(bodyA.rotation, a.frame.z)
    joints.push({
      mateId: mate.id,
      type: "revolute",
      partA: bodyA.partId,
      partB: bodyB.partId,
      pointMm: add(bodyA.positionMm, rotate(bodyA.rotation, a.frame.originMm)),
      axis: scale(axis, 1 / length(axis)),
      contactsEnabled: mate.contactsEnabled,
    })
  }
  return { bodies, joints }
}
