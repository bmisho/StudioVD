import { add, cross, dot, rotate, scale, sub } from "@/core/math/vec3"
import type { MateId, PartId, SceneDocument, Vec3 } from "@/core/schema"
import { mmToM } from "@/core/units"
import { physicsModelFromDocument, type PhysicsBodyModel } from "./physicsModel"

// Gravity from the 3D parts (PLAN 12.6, §2): the solver's only source of gravity (Rapier's
// world has none). Each part weighs m·|g|; each revolute mate carries the torque gravity puts
// on everything beyond it (away from the ground) about its axis, each prismatic mate the
// force along it. Masses and centres of mass honour the parts' overrides.

export interface JointLoad {
  kind: "torque" | "force"
  /** N·m about, or N along, anchor A's z: positive drives the mate's coordinate up. */
  value: number
  /** Mass beyond the joint, kg. */
  massKg: number
}

export interface GravityLoads {
  /** Weight of each part, N. */
  weightN: Record<PartId, number>
  /** Joints whose far side is free of the ground; a joint on a closed loop has none. */
  joints: Record<MateId, JointLoad>
}

type Doc = Pick<
  SceneDocument,
  "parts" | "assets" | "materials" | "anchors" | "mates" | "couplings" | "connectors"
>

/** A body's mass and centre of mass in world mm. */
function bodyMass(doc: Doc, body: PhysicsBodyModel): { m: number; com: Vec3 } {
  let m = 0
  let moment: Vec3 = [0, 0, 0]
  for (const p of body.parts) {
    const part = doc.parts[p.partId]
    const asset = part ? doc.assets[part.assetId] : undefined
    if (!part) continue
    const local = part.comOverrideMm ?? asset?.centroidMm ?? p.box.centerMm
    const world = add(part.pose.positionMm, rotate(part.pose.quaternion, local))
    m += p.massKg
    moment = add(moment, scale(world, p.massKg))
  }
  return { m, com: m > 0 ? scale(moment, 1 / m) : body.positionMm }
}

/** `g` in m/s², world frame (the document's simulation setting). */
export function gravityLoads(doc: Doc, g: Vec3): GravityLoads {
  const model = physicsModelFromDocument(doc)
  const mass = new Map(model.bodies.map((b) => [b.id as string, bodyMass(doc, b)]))
  const weightN: Record<PartId, number> = {}
  const gMag = Math.hypot(g[0], g[1], g[2])
  for (const b of model.bodies) for (const p of b.parts) weightN[p.partId] = p.massKg * gMag

  const grounded = new Set(model.bodies.filter((b) => b.grounded).map((b) => b.id as string))
  /** Bodies reachable from `start` without crossing joint `skip`. */
  const side = (start: string, skip: number): Set<string> => {
    const seen = new Set([start])
    const queue = [start]
    while (queue.length > 0) {
      const at = queue.pop()
      model.joints.forEach((j, k) => {
        if (k === skip) return
        const next = j.bodyA === at ? j.bodyB : j.bodyB === at ? j.bodyA : null
        if (next !== null && !seen.has(next)) {
          seen.add(next)
          queue.push(next)
        }
      })
    }
    return seen
  }
  const joints: Record<MateId, JointLoad> = {}
  model.joints.forEach((j, k) => {
    if (j.type === "spherical") return
    const sideB = side(j.bodyB, k)
    const sideA = side(j.bodyA, k)
    const freeB = ![...sideB].some((b) => grounded.has(b)) && !sideB.has(j.bodyA)
    const freeA = ![...sideA].some((b) => grounded.has(b)) && !sideA.has(j.bodyB)
    if (!freeB && !freeA) return // a loop, or ground on both sides
    // The coordinate measures B relative to A: a load on A's side drives it the other way.
    const [far, sign] = freeB ? [sideB, 1] : [sideA, -1]
    let total = 0
    let value = 0
    for (const id of far) {
      const b = mass.get(id)
      if (!b) continue
      total += b.m
      const force = scale(g, b.m) // N
      if (j.type === "revolute") {
        const arm = scale(sub(b.com, j.pointMm), mmToM(1)) // m
        value += dot(j.axis, cross(arm, force))
      } else value += dot(j.axis, force)
    }
    joints[j.mateId] = {
      kind: j.type === "revolute" ? "torque" : "force",
      value: sign * value,
      massKg: total,
    }
  })
  return { weightN, joints }
}
