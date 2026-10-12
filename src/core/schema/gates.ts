import type { z } from "zod"

/**
 * A collection a later phase owns: part of scene.json v1 from the start, but accepted only
 * empty until that phase defines its entities. Relaxing a gate never invalidates a saved file,
 * so it needs no migration; reshaping data that files already hold would (PLAN 5.1).
 */
export function emptyUntil<T extends z.ZodType<Record<string, unknown>>>(
  schema: T,
  phase: number,
  what: string
) {
  return schema.refine((record) => Object.keys(record).length === 0, {
    message: `${what} are not supported yet (Phase ${phase})`,
  })
}
