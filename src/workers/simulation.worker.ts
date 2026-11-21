/// <reference lib="webworker" />
import { simulate } from "@/core/sim/engine/simulate"
import type { SimulationReply, SimulationRequest } from "./simulationProtocol"

// The steady-state solver (PLAN 12.8): off the main thread, one request at a time.

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = (event: MessageEvent<SimulationRequest>) => {
  const { id, doc, state, injected } = event.data
  const start = performance.now()
  let reply: SimulationReply
  try {
    reply = {
      id,
      ok: true,
      result: simulate(doc, { state, injected }),
      ms: performance.now() - start,
    }
  } catch (e) {
    reply = { id, ok: false, message: e instanceof Error ? e.message : String(e) }
  }
  scope.postMessage(reply)
}
