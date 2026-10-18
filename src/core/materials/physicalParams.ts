import type { Material, Vec3 } from "@/core/schema"

/** sRGB transfer function (IEC 61966-2-1), one channel in [0, 1]. */
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

/** `#rrggbb` (sRGB) to linear-sRGB channels, three's working colour space. */
export function srgbHexToLinear(hex: string): Vec3 {
  const channel = (i: number) => toLinear(parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255)
  return [channel(0), channel(1), channel(2)]
}

/** Linear-sRGB channels (source colours from glTF and STEP) to stored `#rrggbb`. */
export function linearToSrgbHex(rgb: readonly number[]): string {
  const byte = (c: number) =>
    Math.round(toSrgb(Math.min(1, Math.max(0, c))) * 255)
      .toString(16)
      .padStart(2, "0")
  return `#${byte(rgb[0] ?? 0)}${byte(rgb[1] ?? 0)}${byte(rgb[2] ?? 0)}`
}

/** What three's MeshPhysicalMaterial gets for a document material (colours linear). */
export interface PhysicalParams {
  color: Vec3
  metalness: number
  roughness: number
  opacity: number
  /** Drawn in the sorted transparent pass, without writing depth. */
  transparent: boolean
  depthWrite: boolean
  transmission: number
  ior: number
  /** Part millimetres (three takes thickness in mesh units). */
  thickness: number
  clearcoat: number
  clearcoatRoughness: number
  emissive: Vec3
  emissiveIntensity: number
}

/**
 * The render parameters of a material (PLAN 6.5). Transmissive materials stay opaque in
 * three's sense (opacity 1, depth written; three: "when transmission is non-zero, opacity
 * should be set to 1"). Others below full opacity go to the transparent pass, which sorts
 * per object and writes no depth.
 */
export function physicalParams(material: Material): PhysicalParams {
  const transmissive = material.transmission > 0
  const transparent = !transmissive && material.opacity < 1
  return {
    color: srgbHexToLinear(material.color),
    metalness: material.metalness,
    roughness: material.roughness,
    opacity: transmissive ? 1 : material.opacity,
    transparent,
    depthWrite: !transparent,
    transmission: material.transmission,
    ior: material.ior,
    thickness: material.thicknessMm,
    clearcoat: material.clearcoat,
    clearcoatRoughness: material.clearcoatRoughness,
    emissive: srgbHexToLinear(material.emissive),
    emissiveIntensity: material.emissiveIntensity,
  }
}
