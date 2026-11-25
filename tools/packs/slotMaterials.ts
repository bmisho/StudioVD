import { tinted } from "@/core/generators/materials"
import { BUILTIN_MATERIALS } from "@/core/materials/builtinMaterials"
import type { ComponentPart, MaterialRef } from "@/core/schema"

const density = (key: string): number => {
  const m = BUILTIN_MATERIALS.find((b) => b.key === key)
  if (!m) throw new Error(`no built-in ${key}`)
  return m.densityKgM3
}

/** How one colour slot of a KiCad model looks: a metal lead, a plastic body, or a built-in. */
export type SlotLook = "metal" | "plastic" | `std.${string}`

/**
 * Leads and pins are light, unsaturated greys in KiCad's models; bodies are coloured or dark.
 * A guess for the look only: the recipe can say otherwise per colour.
 */
export function guessLook(hex: string): "metal" | "plastic" {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ]
  const max = Math.max(r, g, b)
  return max - Math.min(r, g, b) < 0.12 && max > 0.55 ? "metal" : "plastic"
}

/**
 * The manifest materials for a model's colour slots (`colours[i]` is slot i's sRGB hex), the
 * part's own material (slot 0's) and its slot overrides. Metal looks like steel and plastic
 * like ABS, each in the model's colour, with that built-in's sourced density; a built-in key
 * is used as it is.
 */
export function slotMaterials(
  slotNames: readonly string[],
  colours: readonly string[],
  looks: Readonly<Record<string, SlotLook>>
): {
  materials: Record<string, MaterialRef>
  material: string
  materialSlots?: ComponentPart["materialSlots"]
} {
  const materials: Record<string, MaterialRef> = {}
  const keys = colours.map((hex, i) => {
    const look = (Object.hasOwn(looks, hex) ? looks[hex] : undefined) ?? guessLook(hex)
    const key = `m${i}`
    if (look.startsWith("std.")) {
      density(look) // refuses an unknown key
      materials[key] = { kind: "builtin", key: look }
    } else if (look === "metal") {
      materials[key] = tinted("std.steel", `Metal ${hex}`, hex.toLowerCase(), density("std.steel"))
    } else {
      materials[key] = tinted("std.abs", `Plastic ${hex}`, hex.toLowerCase(), density("std.abs"))
    }
    return key
  })
  const [first, ...rest] = keys
  if (!first) throw new Error("a model without colours")
  const overrides = rest.map((material, i) => ({ slot: slotNames[i + 1] ?? "", material }))
  return {
    materials,
    material: first,
    ...(overrides.length > 0 && { materialSlots: overrides }),
  }
}
