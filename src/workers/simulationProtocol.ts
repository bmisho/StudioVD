import type { SceneDocument } from "@/core/schema"
import type { SimResult } from "@/core/sim/engine/results"
import type { Injected, SignalValue } from "@/core/sim/engine/types"

/** Main thread → solver worker: the schematic and settings, with last solve's memories. */
export interface SimulationRequest {
  id: number
  doc: Pick<SceneDocument, "schematic" | "simulation">
  state: Record<string, Record<string, SignalValue>>
  /** What bindings bring in from 3D, sampled as the request went out (PLAN 13.4). */
  injected: Injected
}

export type SimulationReply =
  | { id: number; ok: true; result: SimResult; ms: number }
  | { id: number; ok: false; message: string }
