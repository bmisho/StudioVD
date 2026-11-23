import { wireMaterial, type WireColourKey } from "@/core/connectors/wireSpecs"
import {
  COLLECTION_CAPS,
  ConnectorSchema,
  MAX_CABLE_VIA,
  newId,
  type AnchorId,
  type ConnectorId,
  type MaterialId,
} from "@/core/schema"
import type { Get, Set } from "./actionTypes"

export interface CableActions {
  /** A cable in a wire colour: that colour's PVC material, made once and reused (PLAN 16.3). */
  setCableColour: (id: ConnectorId, colour: WireColourKey) => void
  /**
   * A cable's waypoints, in route order. Refused unless every one is an anchor that exists,
   * none repeats, and none is one of its ends: Open would refuse such a file.
   */
  setCableVia: (id: ConnectorId, via: readonly AnchorId[]) => void
}

export function cableActions(set: Set, get: Get): CableActions {
  const cableOf = (id: ConnectorId) => {
    const c = Object.hasOwn(get().doc.connectors, id) ? get().doc.connectors[id] : undefined
    return c?.kind === "cable" ? c : null
  }
  return {
    setCableColour: (id, colour) => {
      const c = cableOf(id)
      if (!c) return
      const doc = get().doc
      const found = wireMaterial(doc, colour, () => newId<MaterialId>())
      if (!found) return
      if (found.isNew && Object.keys(doc.materials).length >= COLLECTION_CAPS.materials) return
      if (c.materialId === found.material.id) return
      set((s) => {
        if (found.isNew) s.doc.materials[found.material.id] = found.material
        const target = s.doc.connectors[id]
        if (target) target.materialId = found.material.id
      })
    },
    setCableVia: (id, via) => {
      const c = cableOf(id)
      if (!c || via.length > MAX_CABLE_VIA) return
      const anchors = get().doc.anchors
      const all = [c.ends[0], ...via, c.ends[1]]
      if (via.some((a) => !Object.hasOwn(anchors, a)) || new Set(all).size !== all.length) return
      const next = { ...c, via: [...via] }
      if (!ConnectorSchema.safeParse(next).success) return
      set((s) => {
        s.doc.connectors[id] = next
      })
    },
  }
}
