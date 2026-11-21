import { checkBindingRefs } from "@/core/schema/bindingIntegrity"
import { BindingSchema, COLLECTION_CAPS, newId, type Binding, type BindingId } from "@/core/schema"
import type { Get, Set } from "./actionTypes"
import { pruneComponents } from "./componentUpkeep"

export interface BindingActions {
  /** A new binding (PLAN 13.1): its id, or why it was refused. */
  addBinding: (
    binding: Omit<Binding, "id">
  ) => { ok: true; id: BindingId } | { ok: false; reason: string }
  /** Changes how a value maps (scale, offset, clamps); null clears a clamp. */
  updateBinding: (
    id: BindingId,
    patch: { scale?: number; offset?: number; min?: number | null; max?: number | null }
  ) => void
  deleteBindings: (ids: readonly BindingId[]) => void
}

export function bindingActions(set: Set, get: Get): BindingActions {
  return {
    addBinding: (input) => {
      const { doc } = get()
      if (Object.keys(doc.bindings).length >= COLLECTION_CAPS.bindings)
        return { ok: false, reason: "The project holds as many bindings as it may." }
      const parsed = BindingSchema.safeParse({ ...input, id: newId<BindingId>() })
      if (!parsed.success)
        return { ok: false, reason: parsed.error.issues[0]?.message ?? "Not a valid binding." }
      const b = parsed.data
      const problems: string[] = []
      checkBindingRefs({ ...doc, bindings: { ...doc.bindings, [b.id]: b } }, (path, message) => {
        if (path.startsWith(`bindings.${b.id}`)) problems.push(message)
      })
      if (problems[0]) return { ok: false, reason: problems[0] }
      set((s) => {
        s.doc.bindings[b.id] = b
      })
      return { ok: true, id: b.id }
    },
    updateBinding: (id, patch) => {
      const old = Object.hasOwn(get().doc.bindings, id) ? get().doc.bindings[id] : undefined
      if (!old) return
      const next: Record<string, unknown> = { ...old }
      for (const key of ["scale", "offset"] as const)
        if (patch[key] !== undefined) next[key] = patch[key]
      for (const key of ["min", "max"] as const) {
        const v = patch[key]
        if (v === null) delete next[key]
        else if (v !== undefined) next[key] = v
      }
      const parsed = BindingSchema.safeParse(next)
      if (!parsed.success) return
      set((s) => {
        s.doc.bindings[id] = parsed.data
      })
    },
    deleteBindings: (ids) =>
      set((s) => {
        for (const id of ids) delete s.doc.bindings[id]
        pruneComponents(s.doc)
      }),
  }
}
