import type { Medium } from "@/core/schema"
import { density } from "./fluid"
import { portId, type Block, type Netlist } from "./netlist"
import type { Solution } from "./newton"
import type { Diagnostic, Reader, SignalValue } from "./types"

// What a solve reports (PLAN 12.9): efforts and flows at every conserved port, signal values,
// the power each block takes, and the findings, each mapped to its blocks.

export interface PortResult {
  effort: number
  /** Into the block at this port. */
  flow: number
}

export interface SimResult {
  converged: boolean
  /** Conserved ports by `node/port`. */
  ports: Record<string, PortResult>
  /** Signal outputs by `node/port` (an input shows its driver's value under its own id). */
  signals: Record<string, SignalValue>
  /** Power each block takes, W (negative: it supplies). */
  power: Record<string, number>
  supplied: number
  dissipated: number
  diagnostics: Diagnostic[]
  /** Memories to carry into the next solve. */
  state: Record<string, Record<string, SignalValue>>
}

/** Faster than this, a mechanical net has no steady state: nothing holds or brakes it. */
const RUNAWAY = { mechRotational: 1e4, mechTranslational: 1e3 } as const

function blocksOnRow(netlist: Netlist, row: number): Block[] {
  const net = netlist.nets.find((n) => n.unknown === row)
  if (net)
    return netlist.blocks.filter((b) => Object.values(b.nets).some((n) => netlist.nets[n] === net))
  return netlist.blocks.filter((b) => row >= b.firstBranch && row < b.firstBranch + b.branches)
}

export function results(
  netlist: Netlist,
  solution: Solution,
  values: ReadonlyMap<string, SignalValue>,
  flows: ReadonlyMap<string, number>,
  found: Diagnostic[],
  readerOf: (block: Block) => Reader
): SimResult {
  const diagnostics = [...found]
  if (solution.singularRow !== null) {
    const blocks = blocksOnRow(netlist, solution.singularRow)
    diagnostics.push({
      code: "singular",
      severity: "error",
      message: `No single answer at ${blocks.map((b) => b.inst.label).join(", ") || "one net"}: ideal sources in parallel, a loop of shorts, or one axis held twice.`,
      nodes: blocks.map((b) => b.inst.node),
    })
  } else if (!solution.converged)
    diagnostics.push({
      code: "no-convergence",
      severity: "error",
      message: `The solver did not converge (largest residual ${solution.residual.toPrecision(3)}): the values shown are its last try.`,
      nodes: [],
    })
  const ports: Record<string, PortResult> = {}
  const power: Record<string, number> = {}
  let supplied = 0
  let dissipated = 0
  for (const block of netlist.blocks) {
    const r = readerOf(block)
    let p = 0
    for (const [key, n] of Object.entries(block.nets)) {
      const net = netlist.nets[n]
      const effort = r.e(key)
      const flow = flows.get(portId(block.inst.node, key)) ?? 0
      ports[portId(block.inst.node, key)] = { effort, flow }
      const medium: Medium | undefined = net?.domain === "fluid" ? (net.medium ?? "air") : undefined
      p += medium ? (effort * flow) / density(medium, effort) : effort * flow
      const limit =
        net?.domain === "mechRotational" || net?.domain === "mechTranslational"
          ? RUNAWAY[net.domain]
          : Infinity
      if (
        Math.abs(effort) > limit &&
        !diagnostics.some((d) => d.code === "runaway" && d.nodes.includes(block.inst.node))
      )
        diagnostics.push({
          code: "runaway",
          severity: "warning",
          message: `${block.inst.label}: nothing holds or brakes this axis, so it has no steady speed.`,
          nodes: [block.inst.node],
        })
    }
    power[block.inst.node] = p
    if (p < 0) supplied -= p
    else dissipated += p
    for (const d of block.behaviour.check?.(block.inst, r) ?? [])
      diagnostics.push({ ...d, nodes: [block.inst.node] })
  }
  const signals: Record<string, SignalValue> = Object.fromEntries(values)
  for (const block of netlist.blocks)
    for (const [key, driver] of Object.entries(block.drivers)) {
      const v = values.get(driver)
      if (v !== undefined) signals[portId(block.inst.node, key)] = v
    }
  const state = Object.fromEntries(netlist.blocks.map((b) => [b.inst.node, b.inst.state]))
  return {
    converged: solution.converged && solution.singularRow === null,
    ports,
    signals,
    power,
    supplied,
    dissipated,
    diagnostics,
    state,
  }
}
