import type { GeneratedComponent } from "@/core/generators/prepare"
import type { GeneratorParams } from "@/core/schema"
import type { GenerateReply, GenerateRequest } from "@/workers/generatorProtocol"

let worker: Worker | null = null
let nextId = 1
const pending = new Map<
  number,
  { resolve: (r: GeneratedComponent) => void; reject: (e: Error) => void }
>()

function failAll(message: string) {
  for (const p of pending.values()) p.reject(new Error(message))
  pending.clear()
  worker?.terminate()
  worker = null // the next request starts a fresh worker
}

function getWorker(): Worker {
  if (worker) return worker
  const w = new Worker(new URL("../../workers/generator.worker.ts", import.meta.url), {
    type: "module",
    name: "generator",
  })
  w.onmessage = (event: MessageEvent<GenerateReply>) => {
    const reply = event.data
    const waiting = pending.get(reply.requestId)
    if (!waiting) return
    pending.delete(reply.requestId)
    if (reply.ok) waiting.resolve(reply.result)
    else waiting.reject(new Error(reply.message))
  }
  w.onerror = (event) => failAll(event.message || "The generator worker failed.")
  worker = w
  return w
}

/**
 * Runs a generator in the shared generator worker (PLAN 9.3): resolves with the component's
 * manifest and its prepared assets, or rejects with the generator's message (bad parameters,
 * an unknown generator).
 */
export function generateComponent(
  id: string,
  major: number,
  params: GeneratorParams
): Promise<GeneratedComponent> {
  const requestId = nextId++
  const request: GenerateRequest = { requestId, id, major, params }
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject })
    getWorker().postMessage(request)
  })
}
