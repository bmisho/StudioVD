import { couplingKinds, type CouplingKind } from "@/core/physics/couplingRatio"
import { COLLECTION_CAPS, CouplingSchema, newId, type CouplingId, type MateId } from "@/core/schema"
import type { Get, Set } from "./actionTypes"

/** Largest ratio magnitude taken (rad per rad, or mm per rad). */
export const MAX_COUPLING_RATIO = 1e4

const ratioOk = (r: number) => Number.isFinite(r) && r !== 0 && Math.abs(r) <= MAX_COUPLING_RATIO

export interface CouplingActions {
  /**
   * Two mates moving together in test mode (PLAN 10.5): a gear pair (two hinges), rack and
   * pinion or lead screw (a hinge driving a slide; the hinge is `mateA`). Null when the
   * mates do not fit the kind, or the ratio is not a usable number.
   */
  addCoupling: (
    kind: CouplingKind,
    mateA: MateId,
    mateB: MateId,
    ratio: number
  ) => CouplingId | null
  setCouplingRatio: (id: CouplingId, ratio: number) => void
  deleteCouplings: (ids: readonly CouplingId[]) => void
}

export function couplingActions(set: Set, get: Get): CouplingActions {
  return {
    addCoupling: (kind, mateA, mateB, ratio) => {
      const { doc } = get()
      const [a, b] = [doc.mates[mateA], doc.mates[mateB]]
      if (!Object.hasOwn(doc.mates, mateA) || !Object.hasOwn(doc.mates, mateB) || !a || !b)
        return null
      if (!couplingKinds(a.type, b.type).includes(kind) || !ratioOk(ratio)) return null
      if (Object.keys(doc.couplings).length >= COLLECTION_CAPS.couplings) return null
      const id = newId<CouplingId>()
      const coupling = CouplingSchema.safeParse({ id, kind, mateA, mateB, ratio: ratio + 0 })
      if (!coupling.success) return null
      set((s) => {
        s.doc.couplings[id] = coupling.data
      })
      return id
    },
    setCouplingRatio: (id, ratio) => {
      if (!ratioOk(ratio)) return
      set((s) => {
        const c = Object.hasOwn(s.doc.couplings, id) ? s.doc.couplings[id] : undefined
        if (c && c.ratio !== ratio) c.ratio = ratio + 0
      })
    },
    deleteCouplings: (ids) =>
      set((s) => {
        for (const id of ids) if (Object.hasOwn(s.doc.couplings, id)) delete s.doc.couplings[id]
      }),
  }
}
