import {
  connectionProblem,
  orderSignal,
  type ConnectRefusal,
  type PortRef,
} from "@/core/sim/connections"
import { blockDefOf, findModel } from "@/core/sim/models/registry"
import { paramValue } from "@/core/sim/params"
import {
  newId,
  NameSchema,
  SCHEMATIC_CAPS,
  type BlockDef,
  type BlockDefId,
  type EdgeId,
  type NodeId,
  type ParamValue,
  type SceneDocument,
} from "@/core/schema"
import type { Get, Set } from "./actionTypes"
import { removeSchematic } from "./deletion"

export interface Position {
  x: number
  y: number
}

export interface SchematicActions {
  /** A built-in block (`electrical.resistor@1`) at `position`; null for an unknown model. */
  addBlock: (model: string, position: Position) => NodeId | null
  /** Another block of a definition the project has (a black box, PLAN 11.5). */
  addBlockOf: (def: BlockDefId, position: Position) => NodeId | null
  moveNodes: (positions: ReadonlyMap<NodeId, Position>) => void
  /** Wires two ports (either order); why not, when the rules refuse it (PLAN 11.4). */
  connectPorts: (a: PortRef, b: PortRef) => EdgeId | ConnectRefusal
  /** Deletes blocks (with their wires) and wires: one undo entry. */
  deleteSchematic: (nodes: readonly NodeId[], edges: readonly EdgeId[]) => void
  renameNode: (id: NodeId, label: string) => void
  /** Sets a parameter (validated against its definition); null goes back to the default. */
  setNodeParam: (id: NodeId, key: string, value: ParamValue | null) => void
}

const POSITION_LIMIT = 1e7
export const fits = (p: Position) =>
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  Math.abs(p.x) <= POSITION_LIMIT &&
  Math.abs(p.y) <= POSITION_LIMIT

/** `Resistor 3`: the next number for a block's name. */
export function nextLabel(doc: SceneDocument, base: string): string {
  const used = new Set(Object.values(doc.schematic.nodes).map((n) => n.label))
  for (let i = 1; ; i++) if (!used.has(`${base} ${i}`)) return `${base} ${i}`
}

export function schematicActions(set: Set, get: Get): SchematicActions {
  /** One undo entry: the node, and its definition when the project does not have it yet. */
  const place = (def: BlockDef, isNew: boolean, position: Position): NodeId | null => {
    const { schematic } = get().doc
    if (!fits(position) || Object.keys(schematic.nodes).length >= SCHEMATIC_CAPS.nodes) return null
    if (isNew && Object.keys(schematic.blockDefs).length >= SCHEMATIC_CAPS.blockDefs) return null
    const id = newId<NodeId>()
    const label = nextLabel(get().doc, def.name)
    set((s) => {
      if (isNew) s.doc.schematic.blockDefs[def.id] = def
      s.doc.schematic.nodes[id] = {
        id,
        blockDefId: def.id,
        position: { x: position.x + 0, y: position.y + 0 },
        label,
        paramValues: {},
      }
    })
    return id
  }
  return {
    addBlock: (key, position) => {
      const model = findModel(key)
      if (!model) return null
      // Built-in blocks share one definition per model; a programmable board gets its own,
      // since its program is its own.
      const shared = model.programmable
        ? undefined
        : Object.values(get().doc.schematic.blockDefs).find((d) => d.simModel === key)
      return shared
        ? place(shared, false, position)
        : place(blockDefOf(model, newId<BlockDefId>()), true, position)
    },
    addBlockOf: (id, position) => {
      const { blockDefs } = get().doc.schematic
      const def = Object.hasOwn(blockDefs, id) ? blockDefs[id] : undefined
      return def ? place(def, false, position) : null
    },
    moveNodes: (positions) =>
      set((s) => {
        for (const [id, p] of positions) {
          const node = Object.hasOwn(s.doc.schematic.nodes, id)
            ? s.doc.schematic.nodes[id]
            : undefined
          if (node && fits(p) && (node.position.x !== p.x || node.position.y !== p.y))
            node.position = { x: p.x + 0, y: p.y + 0 }
        }
      }),
    connectPorts: (a, b) => {
      const { doc } = get()
      const problem = connectionProblem(doc, a, b)
      if (problem) return problem
      const ordered = orderSignal(doc, a, b)
      if (!ordered) return "direction"
      if (Object.keys(doc.schematic.edges).length >= SCHEMATIC_CAPS.edges) return "full"
      const id = newId<EdgeId>()
      set((s) => {
        s.doc.schematic.edges[id] = {
          id,
          source: ordered.source.node,
          sourcePort: ordered.source.port,
          target: ordered.target.node,
          targetPort: ordered.target.port,
        }
      })
      return id
    },
    deleteSchematic: (nodes, edges) => set((s) => removeSchematic(s.doc, nodes, edges)),
    renameNode: (id, label) => {
      const parsed = NameSchema.safeParse(label.trim())
      if (!parsed.success || parsed.data.length > 64) return
      set((s) => {
        const node = s.doc.schematic.nodes[id]
        if (node && node.label !== parsed.data) node.label = parsed.data
      })
    },
    setNodeParam: (id, key, value) => {
      const { doc } = get()
      const node = Object.hasOwn(doc.schematic.nodes, id) ? doc.schematic.nodes[id] : undefined
      const def = node
        ? doc.schematic.blockDefs[node.blockDefId]?.params.find((p) => p.key === key)
        : undefined
      if (!node || !def) return
      const next = value === null ? null : paramValue(def, value)
      if (value !== null && next === null) return
      set((s) => {
        const n = s.doc.schematic.nodes[id]
        if (!n) return
        if (next === null || next === def.default) delete n.paramValues[key]
        else n.paramValues[key] = next
      })
    },
  }
}
