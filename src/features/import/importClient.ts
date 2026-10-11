import type { ImportMessage, ImportRequest } from "@/workers/importProtocol"
import type { ImportJob, ImportOutcome } from "./runImport"

export interface RunningImport {
  result: Promise<ImportOutcome>
  /** Stops the work at once (terminates the worker); `result` rejects with an AbortError. */
  cancel: () => void
}

/**
 * Runs one import job in a fresh worker. One worker per job keeps cancellation trivial and
 * frees occt's WASM memory (it only grows) when the job ends.
 */
export function startImport(
  job: ImportJob,
  onProgress: (done: number, total: number, stage: string) => void = () => undefined
): RunningImport {
  const worker = new Worker(new URL("../../workers/import.worker.ts", import.meta.url), {
    type: "module",
    name: "import",
  })
  let settle: { reject: (e: Error) => void } | null = null
  const result = new Promise<ImportOutcome>((resolve, reject) => {
    settle = { reject }
    worker.onmessage = (event: MessageEvent<ImportMessage>) => {
      const message = event.data
      if (message.type === "progress") return onProgress(message.done, message.total, message.stage)
      worker.terminate()
      if (message.type === "done") resolve(message.outcome)
      else reject(new Error(message.message))
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || "The import worker failed."))
    }
  })
  const request: ImportRequest = { job }
  worker.postMessage(request, [job.bytes, ...Object.values(job.resources ?? {})])
  return {
    result,
    cancel: () => {
      worker.terminate()
      settle?.reject(new DOMException("Import cancelled.", "AbortError"))
    },
  }
}
