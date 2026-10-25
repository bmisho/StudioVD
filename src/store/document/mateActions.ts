import { planSnap, type SnapRefusal } from "@/core/assembly/mateSnap"
import { mateDeletion } from "@/core/scene/partOps"
import {
  COLLECTION_CAPS,
  MateSchema,
  newId,
  type AnchorId,
  type Mate,
  type MateId,
  type MateType,
  type PartId,
  type Pose,
} from "@/core/schema"
import { deepEqual } from "@/core/util/deepEqual"
import type { Get, Set } from "./actionTypes"
import { removeMates } from "./deletion"

export interface NewMate {
  anchorA: AnchorId
  anchorB: AnchorId
  type: MateType
  flip: boolean
  angleOffsetRad: number
  limits?: { min: number; max: number }
  contactsEnabled?: boolean
}

/** What the inspector changes; `limits: null` removes the limits. */
export interface MatePatch {
  type?: MateType
  flip?: boolean
  angleOffsetRad?: number
  limits?: { min: number; max: number } | null
  contactsEnabled?: boolean
  suppressed?: boolean
}

export type AddMateResult =
  { ok: true; id: MateId } | { ok: false; reason: SnapRefusal | "invalid" | "full" }

export interface MateActions {
  /**
   * Adds a mate and snaps the side not fixed to the ground onto it, in one undo entry (PLAN
   * 8.2, 8.3). Refused when the anchors are on one part, both sides are grounded, the mate
   * would not validate, or the project holds as many mates as a file may.
   */
  addMate: (mate: NewMate) => AddMateResult
  /**
   * Changes a mate. A new type drops its limits (their unit changes, or it takes none). A new
   * type, direction or angle, or turning it back on, snaps it again in the same undo entry; when it cannot (both sides grounded) the change is kept and the
   * reason returned, else null. A result the schema would refuse, or no change, is ignored.
   */
  updateMate: (id: MateId, patch: MatePatch) => SnapRefusal | null
  /** Snaps a mate again (its parts were moved since); returns why it could not, or null. */
  resnapMate: (id: MateId) => SnapRefusal | null
  /** Deletes mates with the couplings on them and the bindings that name them. */
  deleteMates: (ids: readonly MateId[]) => void
}

/** -0 written to JSON reads back as 0 (scene.json is the contract). */
const plain = (n: number) => n + 0

export function mateActions(set: Set, get: Get): MateActions {
  const mateOf = (id: MateId) =>
    Object.hasOwn(get().doc.mates, id) ? get().doc.mates[id] : undefined
  /** Writes the mate and the snapped poses together: one undo entry. */
  const commit = (mate: Mate, poses: ReadonlyMap<PartId, Pose>) =>
    set((s) => {
      s.doc.mates[mate.id] = mate
      for (const [id, pose] of poses) {
        const part = Object.hasOwn(s.doc.parts, id) ? s.doc.parts[id] : undefined
        if (part) part.pose = pose
      }
    })
  const snapAndCommit = (mate: Mate): SnapRefusal | null => {
    const plan = mate.suppressed ? null : planSnap(get().doc, mate, mate.id)
    commit(mate, plan?.ok ? plan.poses : new Map())
    return plan && !plan.ok ? plan.reason : null
  }

  return {
    addMate: (input) => {
      const doc = get().doc
      if (Object.keys(doc.mates).length >= COLLECTION_CAPS.mates)
        return { ok: false, reason: "full" }
      const parsed = MateSchema.safeParse({
        id: newId<MateId>(),
        type: input.type,
        anchorA: input.anchorA,
        anchorB: input.anchorB,
        flip: input.flip,
        angleOffsetRad: plain(input.angleOffsetRad),
        ...(input.limits
          ? { limits: { min: plain(input.limits.min), max: plain(input.limits.max) } }
          : {}),
        contactsEnabled: input.contactsEnabled ?? false,
        suppressed: false,
      })
      if (!parsed.success || !Number.isFinite(parsed.data.angleOffsetRad))
        return { ok: false, reason: "invalid" }
      const plan = planSnap(doc, parsed.data)
      if (!plan.ok) return { ok: false, reason: plan.reason }
      commit(parsed.data, plan.poses)
      return { ok: true, id: parsed.data.id }
    },

    updateMate: (id, patch) => {
      const current = mateOf(id)
      if (!current) return null
      const next: Mate = { ...current }
      // Only revolute (radians) and prismatic (mm) mates take limits: a new type keeps none.
      if (patch.type !== undefined && patch.type !== current.type) {
        next.type = patch.type
        delete next.limits
      }
      if (patch.flip !== undefined) next.flip = patch.flip
      if (patch.angleOffsetRad !== undefined) next.angleOffsetRad = plain(patch.angleOffsetRad)
      if (patch.contactsEnabled !== undefined) next.contactsEnabled = patch.contactsEnabled
      if (patch.suppressed !== undefined) next.suppressed = patch.suppressed
      if (patch.limits === null) delete next.limits
      else if (patch.limits)
        next.limits = { min: plain(patch.limits.min), max: plain(patch.limits.max) }
      const parsed = MateSchema.safeParse(next)
      if (!parsed.success || !Number.isFinite(parsed.data.angleOffsetRad)) return null
      if (deepEqual(parsed.data, current)) return null
      const moves =
        parsed.data.type !== current.type ||
        parsed.data.flip !== current.flip ||
        parsed.data.angleOffsetRad !== current.angleOffsetRad ||
        (current.suppressed && !parsed.data.suppressed)
      if (moves) return snapAndCommit(parsed.data)
      commit(parsed.data, new Map())
      return null
    },

    resnapMate: (id) => {
      const current = mateOf(id)
      if (!current || current.suppressed) return null
      const plan = planSnap(get().doc, current, id)
      if (!plan.ok) return plan.reason
      if (plan.poses.size > 0) commit(current, plan.poses)
      return null
    },

    deleteMates: (ids) => {
      if (mateDeletion(get().doc, ids).mates.length > 0) set((s) => removeMates(s.doc, ids))
    },
  }
}
