import type { ImportJob, ImportOutcome } from "@/features/import/runImport"

/** Main thread -> import worker: one job per worker (cancel = terminate the worker). */
export interface ImportRequest {
  job: ImportJob
}

/** Import worker -> main thread. */
export type ImportMessage =
  | { type: "progress"; done: number; total: number; stage: string }
  | { type: "done"; outcome: ImportOutcome }
  | { type: "error"; message: string }
