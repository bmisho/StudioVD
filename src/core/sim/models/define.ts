import type { Domain, Medium, ParamDef, Payload, Port } from "@/core/schema/schematic"

// Building blocks for the built-in block library (PLAN 11.3): plain data, checked by the
// same schema as a project's block definitions (registry.test.ts).

export type ModelCategory =
  | "electrical"
  | "electromechanical"
  | "drivers"
  | "mechanical"
  | "fluid"
  | "light"
  | "data"
  | "controllers"

export interface ModelDef {
  /** `electrical.resistor`: with `major`, the id a project's block names (`@1`). */
  id: string
  major: number
  name: string
  summary: string
  category: ModelCategory
  /** A built-in symbol (`symbols.ts`); unknown ones draw as a labelled box. */
  symbol: string
  ports: Port[]
  params: ParamDef[]
  /** Controllers: their behaviour is the user's (sandboxed expressions, PLAN 11.5). */
  programmable?: boolean
}

/** A conserved-domain terminal (electrical, mechanical, fluid). */
export const terminal = (
  key: string,
  name: string,
  domain: Domain,
  unit: string,
  extra: { reference?: string; medium?: Medium; side?: Port["side"] } = {}
): Port => ({ key, name, domain, direction: "terminal", unit, ...extra })

export const pin = (key: string, name: string, side?: Port["side"]): Port =>
  terminal(key, name, "electrical", "V", side ? { side } : {})

/** A signal input or output (data, light). */
export const signal = (
  direction: "in" | "out",
  key: string,
  name: string,
  domain: "data" | "light",
  unit: string,
  payload?: Payload
): Port => ({
  key,
  name,
  domain,
  direction,
  unit,
  ...(payload && { payload }),
  ...(direction === "out" && { side: "right" as const }),
})

/** Where a default that stands for a datasheet value comes from: nowhere yet (CLAUDE §12). */
const TYPICAL = {
  kind: "estimated" as const,
  note: "A typical value, not a datasheet's: set it from your part",
  confidence: "low" as const,
}

/** A number parameter; `typical` marks a default that stands in for a datasheet value. */
export const num = (
  key: string,
  name: string,
  unit: string,
  value: number,
  range: { min?: number; max?: number } = {},
  typical = false
): ParamDef => ({
  key,
  name,
  unit,
  kind: "number",
  default: value,
  ...range,
  ...(typical && { source: TYPICAL }),
})

export const flag = (key: string, name: string, value: boolean): ParamDef => ({
  key,
  name,
  unit: "",
  kind: "bool",
  default: value,
})

export const choice = (key: string, name: string, choices: string[], value: string): ParamDef => ({
  key,
  name,
  unit: "",
  kind: "choice",
  default: value,
  choices,
})
