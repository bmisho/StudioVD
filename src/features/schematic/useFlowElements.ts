import { useMemo } from "react"
import { nodesLinkedToParts } from "@/core/scene/linkedSelection"
import { partsInSelection } from "@/core/scene/partsInSelection"
import { portOf } from "@/core/sim/connections"
import { blockLayout, type BlockLayout } from "@/core/schematic/layout"
import type { BlockDef, Domain, SchematicEdge, SchematicNode } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import type { BlockFlowNode, WireFlowEdge } from "./flowTypes"

export type Measured = ReadonlyMap<string, { width: number; height: number }>

interface NodeInputs {
  def: BlockDef
  selected: boolean
  measured: { width: number; height: number } | undefined
  designator: string | undefined
  linked: boolean
}

const sameInputs = (a: NodeInputs, b: NodeInputs) =>
  a.def === b.def &&
  a.selected === b.selected &&
  a.measured === b.measured &&
  a.designator === b.designator &&
  a.linked === b.linked

// Keyed by the document's own (immutable) objects: an element whose inputs did not change
// keeps its object, so React Flow keeps its measurements and skips it.
const nodeFlows = new WeakMap<SchematicNode, { inputs: NodeInputs; flow: BlockFlowNode }>()
const edgeFlows = new WeakMap<
  SchematicEdge,
  { selected: boolean; domain: Domain; flow: WireFlowEdge }
>()
const layouts = new WeakMap<BlockDef, BlockLayout>()

function layoutOf(def: BlockDef): BlockLayout {
  let layout = layouts.get(def)
  if (!layout) layouts.set(def, (layout = blockLayout(def)))
  return layout
}

function nodeFlow(node: SchematicNode, inputs: NodeInputs): BlockFlowNode {
  const cached = nodeFlows.get(node)
  if (cached && sameInputs(cached.inputs, inputs)) return cached.flow
  const layout = layoutOf(inputs.def)
  const flow: BlockFlowNode = {
    id: node.id,
    type: "block",
    position: node.position,
    selected: inputs.selected,
    width: layout.width,
    height: layout.height,
    ...(inputs.measured ? { measured: inputs.measured } : {}),
    data: {
      label: node.label,
      def: inputs.def,
      layout,
      designator: inputs.designator,
      linked: inputs.linked,
    },
  }
  nodeFlows.set(node, { inputs, flow })
  return flow
}

function edgeFlow(edge: SchematicEdge, selected: boolean, domain: Domain): WireFlowEdge {
  const cached = edgeFlows.get(edge)
  if (cached && cached.selected === selected && cached.domain === domain) return cached.flow
  const flow: WireFlowEdge = {
    id: edge.id,
    type: "wire",
    source: edge.source,
    sourceHandle: edge.sourcePort,
    target: edge.target,
    targetHandle: edge.targetPort,
    selected,
    data: { domain },
  }
  edgeFlows.set(edge, { selected, domain, flow })
  return flow
}

/** The document's schematic as React Flow elements (store-controlled, PLAN 11.1). */
export function useFlowElements(measured: Measured) {
  const schematic = useDocumentStore((s) => s.doc.schematic)
  const components = useDocumentStore((s) => s.doc.components)
  const parts = useDocumentStore((s) => s.doc.parts)
  const groups = useDocumentStore((s) => s.doc.groups)
  const selection = useSessionStore((s) => s.selection)

  const nodes = useMemo(() => {
    const selected = new Set(selection.flatMap((s) => (s.kind === "node" ? [s.id] : [])))
    const linked = nodesLinkedToParts(
      { components, schematic, parts },
      partsInSelection({ parts, groups }, selection)
    )
    return Object.values(schematic.nodes).flatMap((node) => {
      const def = schematic.blockDefs[node.blockDefId]
      if (!def) return []
      const c = node.componentInstanceId
      return [
        nodeFlow(node, {
          def,
          selected: selected.has(node.id),
          measured: measured.get(node.id),
          designator: c !== undefined ? components[c]?.designator : undefined,
          linked: linked.has(node.id),
        }),
      ]
    })
  }, [schematic, components, parts, groups, selection, measured])

  const edges = useMemo(() => {
    const selected = new Set(selection.flatMap((s) => (s.kind === "edge" ? [s.id] : [])))
    return Object.values(schematic.edges).flatMap((edge) => {
      const port = portOf({ schematic }, { node: edge.source, port: edge.sourcePort })
      return port ? [edgeFlow(edge, selected.has(edge.id), port.domain)] : []
    })
  }, [schematic, selection])

  return { nodes, edges }
}
