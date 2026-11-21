import { create } from "zustand"
import type { Domain } from "@/core/schema"
import type { SimResult } from "@/core/sim/engine/results"
import type { Severity } from "@/core/sim/engine/types"

// Simulation results (CLAUDE.md §4, kind 2): session state keyed by node and port ids, never
// inside React Flow's node data (that would re-render the whole graph on every solve).

export interface SimulationState {
  /** The last solve's result; null when there is nothing to solve. */
  result: SimResult | null
  /** The worst finding on each block, for its badge. */
  issues: Readonly<Record<string, Severity>>
  /** How long the last solve took in the worker, ms. */
  ms: number
  /** The largest wire flow per domain, which animation speeds are relative to. */
  scales: Readonly<Partial<Record<Domain, number>>>
  setResult: (
    result: SimResult | null,
    ms?: number,
    scales?: Partial<Record<Domain, number>>
  ) => void
}

const RANK: Record<Severity, number> = { info: 0, warning: 1, error: 2 }

function worstPerNode(result: SimResult | null): Record<string, Severity> {
  const out: Record<string, Severity> = {}
  for (const d of result?.diagnostics ?? [])
    for (const node of d.nodes) {
      const was = out[node]
      if (was === undefined || RANK[d.severity] > RANK[was]) out[node] = d.severity
    }
  return out
}

export const useSimulationStore = create<SimulationState>()((set) => ({
  result: null,
  issues: {},
  ms: 0,
  scales: {},
  setResult: (result, ms = 0, scales = {}) =>
    set({ result, issues: worstPerNode(result), ms, scales }),
}))
