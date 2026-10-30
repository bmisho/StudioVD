import type { z } from "zod"

/** One field of a generator's parameter form (PLAN 9.5 Edit parameters). */
export type ParamField = { key: string; label: string } & (
  | { kind: "number"; min?: number; max?: number; integer: boolean }
  | { kind: "choice"; options: (string | number)[] }
  | { kind: "boolean" }
  | { kind: "numberOrAuto"; min?: number; max?: number }
)

/** `boreMm` → "Bore (mm)", `pressureAngleDeg` → "Pressure angle (°)". */
export function paramLabel(key: string): string {
  const unit = key.endsWith("Mm") ? " (mm)" : key.endsWith("Deg") ? " (°)" : ""
  const base = unit ? key.slice(0, -(key.endsWith("Mm") ? 2 : 3)) : key
  const words = base.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase()
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}${unit}`
}

interface Introspected {
  def: { type: string }
  minValue?: number | null
  maxValue?: number | null
  isInt?: boolean
  options?: readonly unknown[]
  value?: unknown
  shape?: Record<string, Introspected>
}

const bound = (v: number | null | undefined) =>
  v !== null && v !== undefined && Number.isFinite(v) ? v : undefined

function field(key: string, s: Introspected): ParamField | null {
  const label = paramLabel(key)
  const type = s.def.type
  if (type === "number") {
    const min = bound(s.minValue)
    const max = bound(s.maxValue)
    return {
      key,
      label,
      kind: "number",
      ...(min !== undefined && { min }),
      ...(max !== undefined && { max }),
      integer: !!s.isInt,
    }
  }
  if (type === "boolean") return { key, label, kind: "boolean" }
  if (type === "enum")
    return { key, label, kind: "choice", options: (s.options ?? []) as (string | number)[] }
  if (type === "union") {
    const options = (s.options ?? []) as Introspected[]
    if (options.every((o) => o.def.type === "literal"))
      return { key, label, kind: "choice", options: options.map((o) => o.value as string | number) }
    const number = options.find((o) => o.def.type === "number")
    if (number && options.some((o) => o.def.type === "literal" && o.value === "auto")) {
      const min = bound(number.minValue)
      const max = bound(number.maxValue)
      return {
        key,
        label,
        kind: "numberOrAuto",
        ...(min !== undefined && { min }),
        ...(max !== undefined && { max }),
      }
    }
  }
  return null
}

/** The form a generator's strict object schema describes, field by field, in its order. */
export function paramFields(schema: z.ZodType): ParamField[] {
  const shape = (schema as unknown as Introspected).shape ?? {}
  return Object.entries(shape).flatMap(([key, s]) => field(key, s) ?? [])
}
