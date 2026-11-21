import type { SceneDocument } from "@/core/schema"
import { compileNetlist, portId, type Block, type Netlist } from "./netlist"
import { assemble, readerFor, solveConserved, type Signals, type Solution } from "./newton"
import { results, type SimResult } from "./results"
import { evaluateSignals, planSignals } from "./signals"
import type { Diagnostic, Reader, SignalValue } from "./types"

// One steady-state solve (PLAN 12.5): signals and the conserved system alternate until
// neither changes, then hysteresis memories settle (and the whole repeats if one flipped).

/** Most rounds of signals ⇄ conserved ⇄ memories before giving up. */
const MAX_ROUNDS = 40

export interface Previous {
  /** Each block's memory from the last solve (relay contacts, a stalled servo...). */
  state?: Readonly<Record<string, Record<string, SignalValue>>>
}

type Doc = Pick<SceneDocument, "schematic" | "simulation">

export function simulate(doc: Doc, previous: Previous = {}): SimResult {
  const netlist = compileNetlist(doc, previous.state)
  const settings = {
    maxIterations: Math.min(doc.simulation.maxIterations, 500),
    tolerance: doc.simulation.tolerance,
  }
  const values = new Map<string, SignalValue>()
  const signals: Signals = {
    input: (block, port) => {
      const driver = block.drivers[port]
      return driver === undefined ? undefined : values.get(driver)
    },
    own: (block, key) => values.get(portId(block.inst.node, key)),
  }
  let x: Float64Array = new Float64Array(netlist.unknowns)
  const readerOf = (block: Block, flows?: ReadonlyMap<string, number>): Reader =>
    readerFor(netlist, block, x, signals, flows)
  const plan = planSignals(netlist)
  const diagnostics: Diagnostic[] = [...netlist.diagnostics]
  let solution: Solution = { x, converged: true, iterations: 0, singularRow: null, residual: 0 }
  let rounds = 0
  let settled = false
  let unsettled: Block[] = []
  for (; rounds < MAX_ROUNDS; rounds++) {
    unsettled = evaluateSignals(plan, values, (b) => readerOf(b)).unsettled
    solution = solveConserved(netlist, signals, settings, x)
    x = solution.x
    if (solution.singularRow !== null) break
    if (evaluateSignals(plan, values, (b) => readerOf(b)).changed) continue
    const flows = portFlows(netlist, x, signals)
    let flipped = false
    for (const b of netlist.blocks)
      flipped = (b.behaviour.settle?.(b.inst, readerOf(b, flows)) ?? false) || flipped
    if (!flipped) {
      settled = true
      break
    }
  }
  if (unsettled.length > 0)
    diagnostics.push({
      code: "signal-loop",
      severity: "warning",
      message: "A feedback loop of signals does not settle: its values are the last ones tried.",
      nodes: unsettled.map((b) => b.inst.node),
    })
  if (!settled && solution.singularRow === null && unsettled.length === 0)
    diagnostics.push({
      code: "no-settle",
      severity: "warning",
      message: `The circuit and its signals did not settle in ${MAX_ROUNDS} rounds (a switch that keeps flipping?).`,
      nodes: netlist.blocks.filter((b) => b.behaviour.settle).map((b) => b.inst.node),
    })
  const flows = portFlows(netlist, x, signals)
  return results(netlist, solution, values, flows, diagnostics, (b) => readerOf(b, flows))
}

/** What each block takes at each conserved port (`node/port`), at `x`. */
export function portFlows(
  netlist: Netlist,
  x: Float64Array,
  signals: Signals
): Map<string, number> {
  const flows = new Map<string, number>()
  assemble(netlist, x, signals, {
    f: new Float64Array(netlist.unknowns),
    portFlow: (block, port, v) => {
      const id = portId(block.inst.node, port)
      flows.set(id, (flows.get(id) ?? 0) + v)
    },
  })
  return flows
}
