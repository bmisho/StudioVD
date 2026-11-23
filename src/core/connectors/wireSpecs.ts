import { estimated } from "@/core/generators/common"
import { builtinByKey, materialFromBuiltin } from "@/core/materials/presets"
import type { Material, MaterialId, SceneDocument } from "@/core/schema"
import { toMm } from "@/core/units"

/** Insulation colours offered for cables (PLAN 16.3): appearance only, lowercase #rrggbb. */
export const WIRE_COLOURS = [
  { key: "black", name: "Black", color: "#1f1f1f" },
  { key: "red", name: "Red", color: "#c62828" },
  { key: "orange", name: "Orange", color: "#ef6c00" },
  { key: "yellow", name: "Yellow", color: "#f2c811" },
  { key: "green", name: "Green", color: "#2e7d32" },
  { key: "blue", name: "Blue", color: "#1565c0" },
  { key: "violet", name: "Violet", color: "#6a1b9a" },
  { key: "grey", name: "Grey", color: "#8a8a8a" },
  { key: "white", name: "White", color: "#f0f0f0" },
  { key: "brown", name: "Brown", color: "#6d4c41" },
] as const
export type WireColourKey = (typeof WIRE_COLOURS)[number]["key"]

/** The document material for a wire colour: one already made (same name and colour), or a new one. */
export function wireMaterial(
  doc: Pick<SceneDocument, "materials">,
  key: WireColourKey,
  newId: () => MaterialId
): { material: Material; isNew: boolean } | null {
  const colour = WIRE_COLOURS.find((c) => c.key === key)
  const pvc = builtinByKey("std.pvc")
  if (!colour || !pvc) return null
  const name = `Wire (${colour.name.toLowerCase()})`
  const found = Object.values(doc.materials).find(
    (m) => m.name === name && m.color === colour.color && m.builtinKey === pvc.key
  )
  if (found) return { material: found, isNew: false }
  return {
    material: { ...materialFromBuiltin(pvc, newId(), name), color: colour.color },
    isNew: true,
  }
}

/** Solid copper conductor diameter for an AWG size: d = 0.127 mm × 92^((36 − n) / 39). */
export const awgConductorMm = (awg: number): number => 0.127 * 92 ** ((36 - awg) / 39)

/** Nominal insulation wall of UL 1007 hook-up wire, 0.016 in. */
export const HOOKUP_WALL_MM = toMm(0.016, "in")

/** Hook-up wire sizes offered as diameter presets, thickest first. */
export const WIRE_GAUGES = [16, 18, 20, 22, 24, 26, 28, 30].map((awg) => ({
  awg,
  outerMm: Math.round((awgConductorMm(awg) + 2 * HOOKUP_WALL_MM) * 100) / 100,
}))

export const WIRE_SOURCES = [
  {
    what: "AWG conductor diameters",
    source: estimated("ASTM B258 definition: d = 0.127 mm × 92^((36 − n)/39), solid wire", "high"),
  },
  {
    what: "Hook-up wire outer diameters",
    source: estimated(
      "Conductor + 2 × 0.41 mm (UL 1007 nominal wall, 0.016 in); stranded conductors and other insulation are a little thicker",
      "low"
    ),
  },
]
