import type { MeshPhysicalMaterial } from "three"
import { physicalParams } from "@/core/materials/physicalParams"
import type { Material } from "@/core/schema"

/** Copies a material's values (not its maps) onto a three.js material, in place. */
export function applyPhysical(s: MeshPhysicalMaterial, material: Material): void {
  const p = physicalParams(material)
  s.name = material.name
  s.color.setRGB(...p.color)
  s.metalness = p.metalness
  s.roughness = p.roughness
  s.opacity = p.opacity
  // `transparent` is part of the program key, but three does not notice it changing.
  if (s.transparent !== p.transparent) s.needsUpdate = true
  s.transparent = p.transparent
  s.depthWrite = p.depthWrite
  // These setters recompile by themselves when a feature turns on or off (crosses 0).
  s.transmission = p.transmission
  s.ior = p.ior
  s.thickness = p.thickness
  s.clearcoat = p.clearcoat
  s.clearcoatRoughness = p.clearcoatRoughness
  s.emissive.setRGB(...p.emissive)
  s.emissiveIntensity = p.emissiveIntensity
}
