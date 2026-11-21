import type { Edge, Node } from "@xyflow/react"
import type { BlockDef, Domain } from "@/core/schema"
import type { BlockLayout } from "@/core/schematic/layout"

export interface BlockNodeData extends Record<string, unknown> {
  label: string
  def: BlockDef
  layout: BlockLayout
  /** The linked component's designator (PLAN 11.6). */
  designator?: string
  /** Linked to a part selected elsewhere (cross-selection, PLAN 11.6). */
  linked: boolean
}

export type BlockFlowNode = Node<BlockNodeData, "block">

export interface WireEdgeData extends Record<string, unknown> {
  domain: Domain
}

export type WireFlowEdge = Edge<WireEdgeData, "wire">
