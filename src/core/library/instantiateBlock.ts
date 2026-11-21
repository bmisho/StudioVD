import { blockLayout } from "@/core/schematic/layout"
import { freeSpot } from "@/core/schematic/placement"
import {
  newId,
  type BlockDef,
  type BlockDefId,
  type ComponentInstanceId,
  type ComponentManifest,
  type NodeId,
  type ParamValue,
  type SceneDocument,
  type SchematicNode,
} from "@/core/schema"
import { blockDefOf, findModel } from "@/core/sim/models/registry"
import { paramValue } from "@/core/sim/params"

export interface ComponentBlock {
  node: SchematicNode
  /** The definition to add: none when the project already has the shared one. */
  blockDef: BlockDef | null
}

/**
 * A component's schematic block (PLAN 11.7), linked to its instance and named after its
 * designator. Null when the manifest has none, or names a model this app does not have (the
 * component still goes in, without a block). Values a parameter does not take are dropped.
 */
export function componentBlock(
  doc: SceneDocument,
  manifest: ComponentManifest,
  instance: ComponentInstanceId,
  designator: string
): ComponentBlock | null {
  const ref = manifest.schematic
  const model = ref ? findModel(ref.block) : undefined
  if (!ref || !model) return null
  const shared = model.programmable
    ? undefined
    : Object.values(doc.schematic.blockDefs).find((d) => d.simModel === ref.block)
  const def = shared ?? blockDefOf(model, newId<BlockDefId>())
  const values: Record<string, ParamValue> = {}
  for (const [key, raw] of Object.entries(ref.params ?? {})) {
    const param = def.params.find((p) => p.key === key)
    const value = param ? paramValue(param, raw) : null
    if (param && value !== null && value !== param.default) values[key] = value
  }
  const node: SchematicNode = {
    id: newId<NodeId>(),
    blockDefId: def.id,
    position: freeSpot(doc, blockLayout(def), { x: 0, y: 0 }),
    label: designator,
    paramValues: values,
    componentInstanceId: instance,
  }
  return { node, blockDef: shared ? null : def }
}
