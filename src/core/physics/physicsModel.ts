import { anchorWorld } from "@/core/assembly/mateSnap"
import { unionFind } from "@/core/assembly/unionFind"
import { add, normalize, rotate, scale, sub } from "@/core/math/vec3"
import type { Anchor, Mate, Part, PartId, SceneDocument } from "@/core/schema"
import { densityKgM3ToKgMm3 } from "@/core/units"
import { beltCouplings } from "./beltCouplings"
import { mateCoordinate } from "./mateCoordinate"
import type {
  ColliderKind,
  PhysicsBodyModel,
  PhysicsCouplingModel,
  PhysicsJointModel,
  PhysicsModel,
  PhysicsPartModel,
} from "./modelTypes"

export type * from "./modelTypes"

/**
 * Density for parts without a material: steel, 7850 kg/m³ (EN 1991-1-1 Annex A and steel design
 * guides; `docs/research/materials.json`).
 */
export const DEFAULT_DENSITY_KG_M3 = 7850

type ModelSource = Pick<
  SceneDocument,
  "parts" | "assets" | "materials" | "anchors" | "mates" | "couplings" | "connectors"
>

const has = <T>(record: Record<string, T>, key: string | null): T | undefined =>
  key !== null && Object.hasOwn(record, key) ? record[key] : undefined

/**
 * What test mode simulates, derived from the document (PLAN 10.1). Hidden parts and parts
 * without a known asset are left out. Parts joined by fixed mates are ONE body; revolute,
 * prismatic and spherical mates between bodies are joints, with their limits; suppressed
 * mates, mates within one body and mates whose parts are missing are skipped. Couplings name
 * two joints; a belt couples the hinges of its pulleys.
 */
export function physicsModelFromDocument(doc: ModelSource): PhysicsModel {
  const present: Part[] = Object.values(doc.parts).filter(
    (p) => p.visible && has(doc.assets, p.assetId) !== undefined
  )
  const index = new Map(present.map((p, i) => [p.id as string, i]))
  const ends = (mate: Mate) => {
    const [a, b] = [has(doc.anchors, mate.anchorA), has(doc.anchors, mate.anchorB)]
    const [i, j] = [a && index.get(a.partId), b && index.get(b.partId)]
    return a && b && i !== undefined && j !== undefined ? { a, b, i, j } : null
  }
  const mates = Object.values(doc.mates).filter((m) => !m.suppressed)
  const rigid = unionFind(present.length, (i) => present[i]?.grounded ?? false)
  for (const mate of mates) {
    const e = mate.type === "fixed" ? ends(mate) : null
    if (e) rigid.union(e.i, e.j)
  }

  const bodies: PhysicsBodyModel[] = []
  const bodyOfRoot = new Map<number, PhysicsBodyModel>()
  const bodyOf = present.map((part, i) => {
    const root = rigid.find(i)
    let body = bodyOfRoot.get(root)
    if (!body) {
      body = { id: part.id, positionMm: [...part.pose.positionMm], grounded: false, parts: [] }
      bodyOfRoot.set(root, body)
      bodies.push(body)
    }
    body.grounded = rigid.isGrounded(i)
    return body
  })
  present.forEach((part, i) => {
    const body = bodyOf[i]
    if (body) body.parts.push(partModel(doc, part, body))
  })

  const joints: PhysicsJointModel[] = []
  const pulleys = new Map<PartId, PartId>(present.map((p, i) => [p.id, bodyOf[i]?.id ?? p.id]))
  for (const mate of mates) {
    if (mate.type === "fixed") continue
    const e = ends(mate)
    const [bodyA, bodyB] = e ? [bodyOf[e.i], bodyOf[e.j]] : []
    const [partA, partB] = e ? [present[e.i], present[e.j]] : []
    if (!e || !bodyA || !bodyB || !partA || !partB || bodyA === bodyB) continue
    // The joint lives where anchor A is; Phase 8 snapping makes anchor B coincide with it.
    const frame = anchorWorld(partA, e.a)
    joints.push({
      mateId: mate.id,
      type: mate.type,
      bodyA: bodyA.id,
      bodyB: bodyB.id,
      pointMm: frame.t,
      axis: normalize(rotate(frame.q, [0, 0, 1])),
      zero: mateCoordinate(mate, partA, e.a, partB, e.b),
      ...(mate.limits && mate.type !== "spherical" && { limits: { ...mate.limits } }),
      contactsEnabled: mate.contactsEnabled,
    })
  }

  const jointed = new Set<string>(joints.map((j) => j.mateId))
  const couplings: PhysicsCouplingModel[] = Object.values(doc.couplings)
    .filter((c) => jointed.has(c.mateA) && jointed.has(c.mateB))
    .map((c) => ({ id: c.id, mateA: c.mateA, mateB: c.mateB, ratio: c.ratio }))
  const anchorOf = (id: string): { anchor: Anchor; part: Part } | null => {
    const anchor = has(doc.anchors, id)
    const part = anchor && present[index.get(anchor.partId) ?? -1]
    return anchor && part ? { anchor, part } : null
  }
  couplings.push(...beltCouplings(Object.values(doc.connectors), joints, anchorOf, pulleys))
  return { bodies, joints, couplings }
}

function partModel(doc: ModelSource, part: Part, body: PhysicsBodyModel): PhysicsPartModel {
  const asset = doc.assets[part.assetId]
  const { min, max } = asset?.bboxMm ?? { min: [0, 0, 0], max: [0, 0, 0] }
  const half = scale(sub(max, min), 0.5)
  const density = densityKgM3ToKgMm3(
    has(doc.materials, part.materialId)?.densityKgM3 ?? DEFAULT_DENSITY_KG_M3
  )
  // A closed mesh's own volume; else its box (an open shell has no volume to trust).
  const closed = asset?.watertight === true && (asset.volumeMm3 ?? 0) > 0
  const volume = closed ? (asset.volumeMm3 ?? 0) : 8 * half[0] * half[1] * half[2]
  const kind: ColliderKind = part.collider === "trimesh" && !body.grounded ? "hull" : part.collider
  return {
    partId: part.id,
    assetId: part.assetId,
    offsetMm: sub(part.pose.positionMm, body.positionMm),
    rotation: [...part.pose.quaternion],
    box: { centerMm: scale(add(min, max), 0.5), halfExtentsMm: half },
    collider: kind,
    // Never massless: a zero-volume box (a flat import) still weighs a milligram.
    massKg: part.massOverrideKg ?? Math.max(density * volume, 1e-6),
  }
}
