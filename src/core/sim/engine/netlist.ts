import type { BlockDef, Domain, Medium, ParamValue, SceneDocument } from "@/core/schema"
import { CONSERVED_DOMAINS } from "@/core/schema/schematic"
import { findModel } from "../models/registry"
import { effectiveParam } from "../params"
import { behaviourOf } from "./behaviours"
import { groundingDiagnostics } from "./grounding"
import type { Behaviour, Diagnostic, Instance, SignalValue } from "./types"

// The netlist compiler (PLAN 12.2): conserved ports joined by wires become nets (union-find),
// one unknown per net that is not a reference, plus each block's branch unknowns.

export const portId = (node: string, port: string) => `${node}/${port}`

export interface Net {
  domain: Domain
  ports: string[]
  /** Ground, frame or atmosphere: effort 0, no unknown. */
  reference: boolean
  /** Fluid nets: their island's medium. */
  medium?: Medium
  /** Its effort's index in the unknowns, or -1 for a reference. */
  unknown: number
}

export interface Block {
  inst: Instance
  def: BlockDef
  behaviour: Behaviour
  /** Net index of each conserved port, by port key. */
  nets: Record<string, number>
  /** The driving output (`node/port`) of each connected signal input, by port key. */
  drivers: Record<string, string>
  /** Index of the first branch unknown, and how many. */
  firstBranch: number
  branches: number
}

export interface Netlist {
  nets: Net[]
  blocks: Block[]
  unknowns: number
  diagnostics: Diagnostic[]
}

type Schematic = Pick<SceneDocument, "schematic">

function find(parent: number[], i: number): number {
  let r = i
  while (parent[r] !== r) r = parent[r] ?? r
  while (parent[i] !== r) [parent[i], i] = [r, parent[i] ?? r]
  return r
}

/** Parameter values: the block's own, else its definition's default, else the model's. */
function paramsOf(def: BlockDef, values: Readonly<Record<string, ParamValue>>) {
  const out: Record<string, ParamValue> = {}
  const model = def.simModel !== undefined ? findModel(def.simModel) : undefined
  for (const p of model?.params ?? []) out[p.key] = p.default
  for (const p of def.params) out[p.key] = effectiveParam(p, values)
  return out
}

export function compileNetlist(
  doc: Schematic,
  state: Readonly<Record<string, Record<string, SignalValue>>> = {}
): Netlist {
  const { nodes, edges, blockDefs } = doc.schematic
  const diagnostics: Diagnostic[] = []
  // Every conserved port gets an index; wires join them.
  const index = new Map<string, number>()
  const domains: Domain[] = []
  const media: (Medium | undefined)[] = []
  for (const node of Object.values(nodes)) {
    const def = blockDefs[node.blockDefId]
    for (const p of def?.ports ?? [])
      if (CONSERVED_DOMAINS.has(p.domain)) {
        index.set(portId(node.id, p.key), domains.length)
        domains.push(p.domain)
        media.push(p.medium)
      }
  }
  const parent = domains.map((_, i) => i)
  const drivers = new Map<string, string>()
  for (const e of Object.values(edges)) {
    const [a, b] = [
      index.get(portId(e.source, e.sourcePort)),
      index.get(portId(e.target, e.targetPort)),
    ]
    if (a !== undefined && b !== undefined) parent[find(parent, a)] = find(parent, b)
    else drivers.set(portId(e.target, e.targetPort), portId(e.source, e.sourcePort))
  }
  const netOf = new Map<number, number>()
  const nets: Net[] = []
  for (const [id, i] of index) {
    const root = find(parent, i)
    let n = netOf.get(root)
    if (n === undefined) {
      n = nets.length
      netOf.set(root, n)
      nets.push({ domain: domains[i] ?? "electrical", ports: [], reference: false, unknown: -1 })
    }
    nets[n]?.ports.push(id)
  }
  const netIndex = (id: string) => netOf.get(find(parent, index.get(id) ?? 0)) ?? 0

  const blocks: Block[] = []
  for (const node of Object.values(nodes)) {
    const def = blockDefs[node.blockDefId]
    if (!def) continue
    const behaviour = behaviourOf(def)
    if (!behaviour) {
      diagnostics.push({
        code: "unknown-model",
        severity: "warning",
        message: `${node.label}: ${def.simModel ?? "this block"} is not known to this StudioVD; it is left out.`,
        nodes: [node.id],
      })
      continue
    }
    const block: Block = {
      inst: {
        node: node.id,
        label: node.label,
        params: paramsOf(def, node.paramValues),
        state: { ...(state[node.id] ?? {}) },
      },
      def,
      behaviour,
      nets: {},
      drivers: {},
      firstBranch: 0,
      branches: 0,
    }
    for (const p of def.ports) {
      const id = portId(node.id, p.key)
      if (index.has(id)) block.nets[p.key] = netIndex(id)
      const driver = drivers.get(id)
      if (driver !== undefined) block.drivers[p.key] = driver
    }
    for (const g of behaviour.grounds ?? []) {
      const n = block.nets[g]
      const net = n !== undefined ? nets[n] : undefined
      if (net) net.reference = true
    }
    blocks.push(block)
  }
  diagnostics.push(...groundingDiagnostics(nets, blocks, media, index))
  for (const block of blocks) {
    const fluid: Record<string, Medium> = {}
    for (const [key, n] of Object.entries(block.nets)) {
      const medium = nets[n]?.medium
      if (medium) fluid[key] = medium
    }
    block.inst.media = fluid
  }

  let unknowns = 0
  for (const net of nets) if (!net.reference) net.unknown = unknowns++
  for (const block of blocks) {
    block.firstBranch = unknowns
    block.branches = block.behaviour.branches?.(block.inst) ?? 0
    unknowns += block.branches
  }
  return { nets, blocks, unknowns, diagnostics }
}
