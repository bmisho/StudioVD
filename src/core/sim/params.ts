import type { ParamDef, ParamValue } from "@/core/schema/schematic"

/** The value a parameter takes from `raw`, or null when it does not fit its definition. */
export function paramValue(def: ParamDef, raw: ParamValue): ParamValue | null {
  switch (def.kind) {
    case "number":
      if (typeof raw !== "number" || !Number.isFinite(raw)) return null
      if (def.min !== undefined && raw < def.min) return null
      if (def.max !== undefined && raw > def.max) return null
      return raw + 0
    case "bool":
      return typeof raw === "boolean" ? raw : null
    case "choice":
      return typeof raw === "string" && (def.choices ?? []).includes(raw) ? raw : null
    case "text":
      return typeof raw === "string" && raw.length <= 2048 ? raw : null
  }
}

/** A node's value for a parameter: its own, else the block's default. */
export const effectiveParam = (
  def: ParamDef,
  values: Readonly<Record<string, ParamValue>>
): ParamValue => (Object.hasOwn(values, def.key) ? (values[def.key] ?? def.default) : def.default)
