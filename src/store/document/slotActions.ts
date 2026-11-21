import { bindingOf, openSlots } from "@/core/library/instantiateBindings"
import { checkBindingRefs } from "@/core/schema/bindingIntegrity"
import type { ComponentInstanceId, PartId } from "@/core/schema"
import type { Get, Set } from "./actionTypes"

export interface SlotActions {
  /**
   * Fills a component's slot (PLAN 13.2): its contact template bound to the part the user
   * names, recorded under the template's key. Why not, when refused.
   */
  fillComponentSlot: (instance: ComponentInstanceId, key: string, part: PartId) => string | null
}

export function slotActions(set: Set, get: Get): SlotActions {
  return {
    fillComponentSlot: (instanceId, key, part) => {
      const { doc } = get()
      const c = Object.hasOwn(doc.components, instanceId) ? doc.components[instanceId] : undefined
      const def = c?.def ? doc.componentDefs[c.def] : undefined
      const template = openSlots(def?.manifest, c?.bindings ?? {}).find((t) => t.key === key)
      if (!c || !template) return "That slot is gone or already filled."
      if (!Object.hasOwn(doc.parts, part)) return "That part is gone."
      if (Object.values(c.parts).includes(part)) return "Pick a part outside this component."
      const node = c.nodeId
      const blockDef = node
        ? doc.schematic.blockDefs[doc.schematic.nodes[node]?.blockDefId ?? ("" as never)]
        : undefined
      const b = bindingOf(
        template,
        {
          parts: c.parts,
          anchors: c.anchors,
          mates: c.mates,
          ...(node && { node }),
          ...(blockDef && { def: blockDef }),
        },
        part
      )
      if (!b) return "This slot cannot be bound here."
      const problems: string[] = []
      checkBindingRefs({ ...doc, bindings: { ...doc.bindings, [b.id]: b } }, (path, message) => {
        if (path.startsWith(`bindings.${b.id}`)) problems.push(message)
      })
      if (problems[0]) return problems[0]
      set((s) => {
        s.doc.bindings[b.id] = b
        const inst = s.doc.components[instanceId]
        if (inst) inst.bindings[key] = b.id
      })
      return null
    },
  }
}
