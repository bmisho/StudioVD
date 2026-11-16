import { anchorWorld } from "@/core/assembly/mateSnap"
import { dot, rotate } from "@/core/math/vec3"
import type { Anchor, Connector, Part, PartId, Vec3 } from "@/core/schema"
import type { PhysicsCouplingModel, PhysicsJointModel } from "./modelTypes"

/** Axes this close to parallel are one direction (cos of about 2.5°). */
const PARALLEL = 0.999

/**
 * Belt drives as gear couplings (PLAN 10.5): each wheel a belt wraps turns on the hinge
 * that carries its part, about the belt's axis; an open belt makes their rim speeds equal,
 * $\omega_i r_i = \omega_0 r_0$, all turning the same way. The ratio is between the mates'
 * own coordinates, so it carries a sign for which side of each hinge the wheel is on and
 * which way that hinge's axis points.
 */
export function beltCouplings(
  connectors: readonly Connector[],
  joints: readonly PhysicsJointModel[],
  anchorOf: (id: string) => { anchor: Anchor; part: Part } | null,
  bodyOf: ReadonlyMap<PartId, PartId>
): PhysicsCouplingModel[] {
  const out: PhysicsCouplingModel[] = []
  for (const c of connectors) {
    if (c.kind !== "belt") continue
    let normal: Vec3 | null = null
    const wheels = c.ends.map((end) => {
      const found = anchorOf(end.anchor)
      const body = found && bodyOf.get(found.part.id)
      if (!found || !body) return null
      const axis = rotate(anchorWorld(found.part, found.anchor).q, [0, 0, 1])
      normal ??= axis
      const n = normal
      const hinge = joints.find(
        (j) =>
          j.type === "revolute" &&
          (j.bodyA === body || j.bodyB === body) &&
          Math.abs(dot(j.axis, n)) > PARALLEL
      )
      if (!hinge) return null
      // The wheel's spin about the belt normal per unit of its hinge's coordinate.
      const spin = (hinge.bodyB === body ? 1 : -1) * Math.sign(dot(hinge.axis, n))
      return { hinge, perRad: spin * end.radiusMm }
    })
    const [first] = wheels
    if (!first) continue
    wheels.slice(1).forEach((wheel, i) => {
      if (!wheel || wheel.hinge === first.hinge) return
      out.push({
        id: `belt:${c.id}:${i + 1}`,
        mateA: first.hinge.mateId,
        mateB: wheel.hinge.mateId,
        ratio: first.perRad / wheel.perRad,
      })
    })
  }
  return out
}
