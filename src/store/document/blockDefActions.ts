import type { Draft } from "immer"
import { nextDesignator } from "@/core/library/designators"
import { nestsTooDeep } from "@/core/scene/groupNesting"
import { designatorPrefix } from "@/core/sim/models/designators"
import {
  BlockDefSchema,
  newId,
  NameSchema,
  SCHEMATIC_CAPS,
  type BlockDef,
  type BlockDefId,
  type ComponentInstanceId,
  type GroupId,
  type NodeId,
  type PartId,
  type SceneDocument,
} from "@/core/schema"
import type { Get, Set } from "./actionTypes"
import { unlinkInstance } from "./componentUpkeep"
import { keepFittingWires } from "./schematicRepair"
import { fits, nextLabel, type Position } from "./schematicActions"

export type BlockDefPatch = Partial<Pick<BlockDef, "name" | "ports" | "params" | "behaviour">>

export interface BlockDefActions {
  /** A new black box (PLAN 11.5), no ports yet, as a block at `position`. */
  createBlackBox: (name: string, position: Position) => NodeId | null
  /**
   * Edits a definition every block of it shares: a black box entirely, a programmable board
   * only its program. Wires to ports that went or no longer fit go too. Why not, if refused.
   */
  updateBlockDef: (id: BlockDefId, patch: BlockDefPatch) => string | null
  /**
   * Links a block to a part (PLAN 11.6): the part's component, or a new one around a plain
   * part (a group named after the block). null unlinks.
   */
  linkNode: (id: NodeId, part: PartId | null) => boolean
}

/** Ends a block's link; a component that existed only for it goes, its group stays. */
function unlinkNode(doc: Draft<SceneDocument>, id: NodeId): void {
  const node = doc.schematic.nodes[id]
  const c = node?.componentInstanceId
  if (!node || c === undefined) return
  delete node.componentInstanceId
  const instance = doc.components[c]
  if (instance?.def === null) unlinkInstance(doc, c)
  else if (instance?.nodeId === id) delete instance.nodeId
}

export function blockDefActions(set: Set, get: Get): BlockDefActions {
  return {
    createBlackBox: (name, position) => {
      const parsed = NameSchema.safeParse(name.trim())
      const { schematic } = get().doc
      if (
        !parsed.success ||
        !fits(position) ||
        Object.keys(schematic.blockDefs).length >= SCHEMATIC_CAPS.blockDefs ||
        Object.keys(schematic.nodes).length >= SCHEMATIC_CAPS.nodes
      )
        return null
      const def: BlockDef = {
        id: newId<BlockDefId>(),
        name: parsed.data,
        ports: [],
        params: [],
        behaviour: "",
      }
      const id = newId<NodeId>()
      const label = nextLabel(get().doc, def.name)
      set((s) => {
        s.doc.schematic.blockDefs[def.id] = def
        s.doc.schematic.nodes[id] = {
          id,
          blockDefId: def.id,
          position: { x: position.x + 0, y: position.y + 0 },
          label,
          paramValues: {},
        }
      })
      return id
    },
    updateBlockDef: (id, patch) => {
      const { blockDefs } = get().doc.schematic
      const old = Object.hasOwn(blockDefs, id) ? blockDefs[id] : undefined
      if (!old) return "That block is gone"
      const builtIn = old.simModel !== undefined
      if (builtIn && (patch.ports || patch.params || patch.name !== undefined))
        return "A built-in block's ports and parameters come with StudioVD"
      if (builtIn && old.behaviour === undefined) return "This block has no program"
      const parsed = BlockDefSchema.safeParse({ ...old, ...patch, id })
      if (!parsed.success) return parsed.error.issues[0]?.message ?? "Not a valid block"
      set((s) => {
        s.doc.schematic.blockDefs[id] = parsed.data
        keepFittingWires(s.doc, id)
      })
      return null
    },
    linkNode: (id, partId) => {
      const { doc } = get()
      const node = Object.hasOwn(doc.schematic.nodes, id) ? doc.schematic.nodes[id] : undefined
      if (!node) return false
      if (partId === null) {
        set((s) => unlinkNode(s.doc, id))
        return true
      }
      const part = Object.hasOwn(doc.parts, partId) ? doc.parts[partId] : undefined
      if (!part) return false
      const existing = part.componentRef?.instance
      if (existing !== undefined && doc.components[existing]?.nodeId === id) return true
      const group = newId<GroupId>()
      if (existing === undefined && nestsTooDeep(doc.groups, { [group]: part.parentId }))
        return false
      const def = doc.schematic.blockDefs[node.blockDefId]
      set((s) => {
        unlinkNode(s.doc, id)
        let target = existing
        if (target === undefined) {
          target = newId<ComponentInstanceId>()
          s.doc.groups[group] = { id: group, name: node.label || "Block", parentId: part.parentId }
          const p = s.doc.parts[partId]
          if (p) {
            p.parentId = group
            p.componentRef = { instance: target, key: "part" }
          }
          s.doc.components[target] = {
            id: target,
            def: null,
            designator: nextDesignator(s.doc, designatorPrefix(def?.simModel)),
            groupId: group,
            parts: { part: partId },
            anchors: {},
            mates: {},
            materials: {},
            bindings: {},
          }
        }
        const c = s.doc.components[target]
        const n = s.doc.schematic.nodes[id]
        if (!c || !n) return
        // The component moves to this block; the one it had keeps its place, unlinked.
        const before = c.nodeId !== undefined ? s.doc.schematic.nodes[c.nodeId] : undefined
        if (before) delete before.componentInstanceId
        c.nodeId = id
        n.componentInstanceId = target
      })
      return true
    },
  }
}
