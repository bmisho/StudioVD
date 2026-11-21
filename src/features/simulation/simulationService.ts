import { useDocumentStore } from "@/store/document/documentStore"
import { documentHistory } from "@/store/document/history"
import { useSessionStore, type SimStatus } from "@/store/session/sessionStore"
import { useSimulationStore } from "@/store/session/simulationStore"
import type { SimResult } from "@/core/sim/engine/results"
import type { SimulationReply, SimulationRequest } from "@/workers/simulationProtocol"
import { flowScales } from "./readouts"
import { createScheduler } from "./solveScheduler"

// Keeps the operating point current (PLAN 12.8): every schematic or settings change solves
// again in the worker; edits are debounced, drags throttled to 30 Hz.

const DEBOUNCE_MS = 150
const THROTTLE_MS = 1000 / 30
/** Only a solve slower than this shows "Solving…" (it would flicker at 30 Hz otherwise). */
const SLOW_MS = 300

function statusOf(result: SimResult): SimStatus {
  if (result.diagnostics.some((d) => d.severity === "error")) return "error"
  return result.diagnostics.some((d) => d.severity === "warning") ? "warning" : "solved"
}

/** Starts solving in the background; returns the stop function. */
export function startSimulation(): () => void {
  if (typeof Worker === "undefined") return () => undefined // jsdom
  const setStatus = (s: SimStatus) => {
    if (useSessionStore.getState().simStatus !== s) useSessionStore.getState().setSimStatus(s)
  }
  let worker: Worker | null = null
  let nextId = 0
  let finish: (() => void) | null = null
  let slow: ReturnType<typeof setTimeout> | null = null
  /** Memories (relays, stalls) carried from one solve to the next. */
  let state: SimulationRequest["state"] = {}

  const settle = () => {
    if (slow !== null) clearTimeout(slow)
    slow = null
    const f = finish
    finish = null
    f?.()
  }
  const workerOf = () => {
    if (worker) return worker
    worker = new Worker(new URL("../../workers/simulation.worker.ts", import.meta.url), {
      type: "module",
      name: "simulation",
    })
    worker.onmessage = (event: MessageEvent<SimulationReply>) => {
      const reply = event.data
      if (reply.id !== nextId) return // a newer request is on its way
      if (reply.ok) {
        state = reply.result.state
        const scales = flowScales(useDocumentStore.getState().doc, reply.result)
        useSimulationStore.getState().setResult(reply.result, reply.ms, scales)
        setStatus(statusOf(reply.result))
      } else setStatus("error")
      settle()
    }
    worker.onerror = () => {
      setStatus("error")
      settle()
    }
    return worker
  }

  const scheduler = createScheduler({
    debounceMs: DEBOUNCE_MS,
    throttleMs: THROTTLE_MS,
    run: (done) => {
      const { doc } = useDocumentStore.getState()
      if (Object.keys(doc.schematic.nodes).length === 0) {
        useSimulationStore.getState().setResult(null)
        setStatus("idle")
        done()
        return
      }
      finish = done
      const id = ++nextId
      slow = setTimeout(() => setStatus("solving"), SLOW_MS)
      const request: SimulationRequest = {
        id,
        doc: { schematic: doc.schematic, simulation: doc.simulation },
        state,
      }
      workerOf().postMessage(request)
    },
  })
  const unsubscribe = useDocumentStore.subscribe((s, prev) => {
    if (s.doc.schematic !== prev.doc.schematic || s.doc.simulation !== prev.doc.simulation)
      scheduler.changed(documentHistory.isInGesture())
  })
  scheduler.changed(false)
  return () => {
    unsubscribe()
    scheduler.dispose()
    if (slow !== null) clearTimeout(slow)
    worker?.terminate()
  }
}
