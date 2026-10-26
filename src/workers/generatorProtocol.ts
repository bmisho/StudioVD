import type { GeneratedComponent } from "@/core/generators/prepare"
import type { GeneratorParams } from "@/core/schema"

/** Main thread -> generator worker: run generator `id` at MAJOR `major` (PLAN 9.3). */
export interface GenerateRequest {
  requestId: number
  id: string
  major: number
  params: GeneratorParams
}

/** Generator worker -> main thread; each asset's GLB buffer is transferred. */
export type GenerateReply =
  | { requestId: number; ok: true; result: GeneratedComponent }
  | { requestId: number; ok: false; message: string }
