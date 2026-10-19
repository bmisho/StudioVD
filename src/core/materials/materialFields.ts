import type { Material } from "@/core/schema"

/** A numeric material value the editor shows as a slider with a number field. */
export interface MaterialField {
  key: NumericKey
  label: string
  /** The schema's bounds: what the number field accepts. */
  min: number
  max: number
  /** The slider's span, when narrower than the bounds (thickness, glow). */
  sliderMax?: number
  step: number
  unit?: string
  hint: string
}

export type NumericKey = {
  [K in keyof Material]-?: Material[K] extends number ? K : never
}[keyof Material]

/** Surface values (PLAN 6.3), in editor order. Bounds mirror MaterialSchema. */
export const SURFACE_FIELDS: readonly MaterialField[] = [
  {
    key: "metalness",
    label: "Metalness",
    min: 0,
    max: 1,
    step: 0.01,
    hint: "0 for plastics and glass, 1 for bare metal.",
  },
  {
    key: "roughness",
    label: "Roughness",
    min: 0,
    max: 1,
    step: 0.01,
    hint: "0 is a mirror finish, 1 is fully matte.",
  },
  {
    key: "opacity",
    label: "Opacity",
    min: 0,
    max: 1,
    step: 0.01,
    hint: "Below 1 the part is see-through (not used by glass).",
  },
  {
    key: "clearcoat",
    label: "Clear coat",
    min: 0,
    max: 1,
    step: 0.01,
    hint: "A glossy lacquer layer over the surface.",
  },
  {
    key: "clearcoatRoughness",
    label: "Coat roughness",
    min: 0,
    max: 1,
    step: 0.01,
    hint: "How matte the clear coat is.",
  },
  {
    key: "emissiveIntensity",
    label: "Glow",
    min: 0,
    max: 100,
    sliderMax: 10,
    step: 0.1,
    hint: "How strongly the glow colour lights the surface.",
  },
]

/** Glass values: shown when transmission is on (PLAN 6.5: transmission is for glass only). */
export const GLASS_FIELDS: readonly MaterialField[] = [
  {
    key: "transmission",
    label: "Transmission",
    min: 0,
    max: 1,
    step: 0.01,
    hint: "How much light passes through (refraction).",
  },
  {
    key: "ior",
    label: "IOR",
    min: 1,
    max: 2.333,
    step: 0.001,
    hint: "Index of refraction: 1.5 for most glass, 1.49 acrylic, 1.59 polycarbonate.",
  },
  {
    key: "thicknessMm",
    label: "Thickness",
    min: 0,
    max: 1e4,
    sliderMax: 50,
    step: 0.1,
    unit: "mm",
    hint: "How thick the glass looks for refraction (not the geometry).",
  },
]

/** Physical values: the number field only (no slider: densities span five decades). */
export const DENSITY_FIELD: MaterialField = {
  key: "densityKgM3",
  label: "Density",
  min: 1,
  max: 1e5,
  step: 1,
  unit: "kg/m³",
  hint: "Mass per volume: test mode weighs the part with its part material (not slot materials).",
}

/** A typed value clamped to the field's bounds; NaN (an empty or invalid field) gives null. */
export function clampField(field: MaterialField, value: number): number | null {
  if (!Number.isFinite(value)) return null
  return Math.min(field.max, Math.max(field.min, value))
}
