import {
  createEmptyDocument,
  type BlockDefId,
  type EdgeId,
  type NodeId,
  type ParamValue,
  type SceneDocument,
} from "@/core/schema"
import { blockDefOf, findModel } from "../models/registry"

// Schematics built by hand for engine tests (core tests do not use the store).

export interface Builder {
  doc: SceneDocument
  /** Adds a built-in block; returns its node id. */
  block: (model: string, params?: Record<string, ParamValue>, label?: string) => NodeId
  /** Wires `node.port` to `node.port` (signals: output first). */
  wire: (a: NodeId, ap: string, b: NodeId, bp: string) => void
}

export function schematic(): Builder {
  const doc = createEmptyDocument("0.1.0")
  let n = 0
  const id = <T extends string>() => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` as T
  const defs = new Map<string, BlockDefId>()
  return {
    doc,
    block: (model, params = {}, label) => {
      const m = findModel(model)
      if (!m) throw new Error(`no model ${model}`)
      let defId = defs.get(model)
      if (!defId || m.programmable) {
        const def = blockDefOf(m, id<BlockDefId>())
        doc.schematic.blockDefs[def.id] = def
        defId = def.id
        defs.set(model, defId)
      }
      const node = id<NodeId>()
      doc.schematic.nodes[node] = {
        id: node,
        blockDefId: defId,
        position: { x: 0, y: 0 },
        label: label ?? `${m.name} ${n}`,
        paramValues: params,
      }
      return node
    },
    wire: (a, ap, b, bp) => {
      const e = id<EdgeId>()
      doc.schematic.edges[e] = { id: e, source: a, sourcePort: ap, target: b, targetPort: bp }
    },
  }
}
