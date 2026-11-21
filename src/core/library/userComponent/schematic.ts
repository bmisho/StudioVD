import type { ComponentSchematic, Part, SceneDocument } from "@/core/schema"
import { findModel } from "@/core/sim/models/registry"

/**
 * The schematic block a saved component carries (PLAN 11.7): the one block linked to the
 * components its parts come from, when it is a built-in model. A board's program and a black
 * box stay in the project: manifests carry no behaviour (CLAUDE.md §9).
 */
export function savedSchematic(
  doc: Pick<SceneDocument, "components" | "schematic">,
  parts: readonly Part[]
): { schematic: ComponentSchematic } | Record<string, never> {
  const nodes = new Set<string>()
  for (const part of parts) {
    const c = part.componentRef?.instance
    const node =
      c !== undefined && Object.hasOwn(doc.components, c) ? doc.components[c]?.nodeId : undefined
    if (node !== undefined) nodes.add(node)
  }
  const [only] = nodes
  if (nodes.size !== 1 || only === undefined) return {}
  const node = doc.schematic.nodes[only as keyof typeof doc.schematic.nodes]
  const def = node ? doc.schematic.blockDefs[node.blockDefId] : undefined
  const model = def?.simModel !== undefined ? findModel(def.simModel) : undefined
  if (!node || !def?.simModel || !model || model.programmable) return {}
  const params = { ...node.paramValues }
  return {
    schematic: { block: def.simModel, ...(Object.keys(params).length > 0 && { params }) },
  }
}
