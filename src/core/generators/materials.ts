import { BUILTIN_MATERIALS } from "@/core/materials/builtinMaterials"
import type { MaterialRef } from "@/core/schema"

/**
 * An inline material that looks like built-in `key` in another colour (a black connector
 * body, a cell's wrapper), with its own density.
 */
export function tinted(key: string, name: string, color: string, densityKgM3: number): MaterialRef {
  const base = BUILTIN_MATERIALS.find((m) => m.key === key)
  if (!base) throw new Error(`no built-in material ${key}`)
  return { kind: "inline", name, ...base.look, color, densityKgM3 }
}

/** Connector insulators: black PBT, 1.31 g/cm³ (unfilled grades, ISO 1183). */
export const BLACK_PBT = (): MaterialRef => tinted("std.abs", "Black PBT", "#1f1f1f", 1310)
