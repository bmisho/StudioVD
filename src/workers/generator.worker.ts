/// <reference lib="webworker" />
import { prepareGenerated } from "@/core/generators/prepare"
import { findGenerator } from "@/core/generators/registry"
import type { GenerateReply, GenerateRequest } from "./generatorProtocol"

// Generator worker (PLAN 9.3): parametric parts are meshed and prepared off the main thread,
// through the same pipeline as imports.

const scope = self as unknown as DedicatedWorkerGlobalScope

scope.onmessage = async (event: MessageEvent<GenerateRequest>) => {
  const { requestId, id, major, params } = event.data
  const reply = (message: GenerateReply, transfer: Transferable[] = []) =>
    scope.postMessage(message, transfer)
  try {
    const gen = findGenerator(id, major)
    if (!gen) throw new Error(`This StudioVD has no generator ${id} v${major}.`)
    const result = await prepareGenerated(gen, params)
    const buffers = Object.values(result.assets).map((a) => a.glb.buffer as ArrayBuffer)
    reply({ requestId, ok: true, result }, buffers)
  } catch (error) {
    reply({ requestId, ok: false, message: error instanceof Error ? error.message : String(error) })
  }
}
