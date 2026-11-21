import type { Draft } from "immer"
import { connectionProblem } from "@/core/sim/connections"
import { paramValue } from "@/core/sim/params"
import type { BlockDefId, EdgeId, SceneDocument, SchematicEdge } from "@/core/schema"

/**
 * After a block definition changed (PLAN 11.5): its blocks keep only the wires that still
 * fit the rules, in their order, and only parameter values its parameters still take.
 */
export function keepFittingWires(doc: Draft<SceneDocument>, def: BlockDefId): void {
  const { nodes, edges, blockDefs } = doc.schematic
  const block = blockDefs[def]
  const ofDef = new Set(
    Object.values(nodes)
      .filter((n) => n.blockDefId === def)
      .map((n) => n.id)
  )
  if (!block) return
  for (const id of ofDef) {
    const node = nodes[id]
    if (!node) continue
    for (const [key, value] of Object.entries(node.paramValues)) {
      const param = block.params.find((p) => p.key === key)
      if (!param || paramValue(param, value) === null) delete node.paramValues[key]
    }
  }
  // Re-wire in order against the wires kept so far: a wire is checked as if it were new.
  const kept: Record<string, SchematicEdge> = {}
  const view = { schematic: { nodes, blockDefs, edges: kept } } as unknown as Pick<
    SceneDocument,
    "schematic"
  >
  for (const [id, e] of Object.entries(edges)) {
    const touches = ofDef.has(e.source) || ofDef.has(e.target)
    const fine =
      !touches ||
      connectionProblem(
        view,
        { node: e.source, port: e.sourcePort },
        { node: e.target, port: e.targetPort }
      ) === null
    if (fine) kept[id] = e
    else delete edges[id as EdgeId]
  }
}
