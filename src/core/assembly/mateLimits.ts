import type { Mate } from "@/core/schema"

export type MateLimitRange = NonNullable<Mate["limits"]>

/**
 * The limits with one end set to `value` (PLAN 8.5); past the other end, that end moves along.
 * Give it the limits as they were when the edit began: typing through a value ("9" on the way
 * to "90") then moves the other end only while it is typed.
 */
export function withLimit(
  limits: MateLimitRange,
  end: "min" | "max",
  value: number
): MateLimitRange {
  const next = { ...limits, [end]: value }
  if (next.min > next.max) next[end === "min" ? "max" : "min"] = value
  return next
}
