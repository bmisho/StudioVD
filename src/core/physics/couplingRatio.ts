import { anchorWorld } from "@/core/assembly/mateSnap"
import { gt2PitchDiameter } from "@/core/generators/pulley/gt2/profile"
import { cross, dot, length, normalize, rotate, scale, sub } from "@/core/math/vec3"
import type { Coupling, Mate, MateType, Part, PartId, SceneDocument, Vec3 } from "@/core/schema"

export type CouplingKind = Coupling["kind"]
type Doc = Pick<SceneDocument, "anchors" | "parts" | "components" | "componentDefs">

/** Which couplings fit two mates (A first): a gear pair, or a turn driving a slide. */
export function couplingKinds(a: MateType, b: MateType): CouplingKind[] {
  if (a === "revolute" && b === "revolute") return ["gear"]
  if (a === "revolute" && b === "prismatic") return ["rackPinion", "leadScrew"]
  return []
}

const has = <T>(record: Record<string, T>, key: string): T | undefined =>
  Object.hasOwn(record, key) ? record[key] : undefined

/** The generator and parameters a part was made with, when it was. */
function madeBy(doc: Doc, part: Part | undefined) {
  const ref = part?.componentRef
  const c = ref ? has(doc.components, ref.instance) : undefined
  const authoring = c?.def ? has(doc.componentDefs, c.def)?.manifest.authoring : undefined
  return authoring?.kind === "generator" ? authoring : null
}

/** A gear's or pulley's pitch radius (mm) from its generator, else null. */
function pitchRadius(doc: Doc, part: Part | undefined): number | null {
  const by = madeBy(doc, part)
  const p = by?.params
  if (
    by?.generator === "gear.spur" &&
    typeof p?.moduleMm === "number" &&
    typeof p.teeth === "number"
  )
    return (p.moduleMm * p.teeth) / 2
  if (by?.generator === "pulley.gt2" && typeof p?.teeth === "number")
    return gt2PitchDiameter(p.teeth) / 2
  return null
}

/** A mate's two parts, its anchor A's world axis and origin, and which side `pick` chooses. */
function sides(doc: Doc, mate: Mate, pick: (part: Part) => boolean) {
  const [a, b] = [has(doc.anchors, mate.anchorA), has(doc.anchors, mate.anchorB)]
  const [partA, partB] = [a && has(doc.parts, a.partId), b && has(doc.parts, b.partId)]
  if (!a || !b || !partA || !partB) return null
  const frame = anchorWorld(partA, a)
  // The chosen side, else B's (the side snapping moves): +1 when it is B, −1 when it is A.
  const onA = !pick(partB) && pick(partA)
  return {
    part: onA ? partA : partB,
    sign: onA ? -1 : 1,
    axis: rotate(frame.q, [0, 0, 1]),
    origin: frame.t,
  }
}

const sgn = (x: number) => (x < 0 ? -1 : 1)

/**
 * A coupling's ratio as the parts give it (PLAN 10.5), in the mates' own coordinates
 * (q̇B = r·q̇A; rad per rad, or mm per rad): meshing gears turn opposite ways at the ratio
 * of their pitch radii; a pinion moves its rack its pitch radius per radian, tangent at the
 * contact; a right-hand lead screw moves its nut back along its axis by lead/2π per radian.
 * The signs follow which side of each mate the gear, rack, screw or nut is on and which way
 * each mate's axis points. Unknown sizes count as 1 (the user sets the number).
 */
export function suggestRatio(doc: Doc, kind: CouplingKind, mateA: Mate, mateB: Mate): number {
  const moving = (p: Part) => !p.grounded
  if (kind === "gear") {
    const wheel = (p: Part) => pitchRadius(doc, p) !== null
    const [a, b] = [sides(doc, mateA, wheel), sides(doc, mateB, wheel)]
    if (!a || !b) return -1
    const [ra, rb] = [pitchRadius(doc, a.part) ?? 1, pitchRadius(doc, b.part) ?? 1]
    // Each wheel's spin about A's axis per unit of its mate's coordinate.
    const [sa, sb] = [a.sign, b.sign * sgn(dot(b.axis, a.axis))]
    return (-(ra / rb) * sa) / sb
  }
  const turning = sides(
    doc,
    mateA,
    kind === "rackPinion"
      ? (p) => pitchRadius(doc, p) !== null
      : (p) => madeBy(doc, p)?.generator === "motion.leadScrew"
  )
  const sliding = sides(doc, mateB, moving)
  if (!turning || !sliding) return 1
  if (kind === "leadScrew") {
    const lead = madeBy(doc, turning.part)?.params.leadMm
    const perRad = (typeof lead === "number" ? lead : 2 * Math.PI) / (2 * Math.PI)
    return -perRad * turning.sign * sliding.sign * sgn(dot(turning.axis, sliding.axis))
  }
  const r = pitchRadius(doc, turning.part) ?? 1
  // The contact: from the pinion's axis to the rack's line, square to both.
  const w: Vec3 = sub(turning.origin, sliding.origin)
  const foot = sub(sub(turning.origin, w), scale(sliding.axis, -dot(w, sliding.axis)))
  const towards = sub(foot, turning.origin)
  const across = sub(towards, scale(turning.axis, dot(towards, turning.axis)))
  if (length(across) < 1e-9) return r
  const tangent = dot(cross(turning.axis, normalize(across)), sliding.axis)
  return r * turning.sign * sliding.sign * sgn(tangent)
}

/** For the inspector: the other mate of a coupling, seen from `id`. */
export const otherMate = (c: Pick<Coupling, "mateA" | "mateB">, id: string): string =>
  c.mateA === id ? c.mateB : c.mateA

export type { PartId }
