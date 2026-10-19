import type { BufferGeometry } from "three"
import type { SourceMesh } from "@/core/geometry/prepareAsset"
import type { SourceSlot } from "@/core/geometry/slots"
import type { Vec3 } from "@/core/schema"

/** A source mesh plus where it sat in the file's hierarchy (assembly / group names). */
export interface ParsedMesh extends SourceMesh {
  path: string[]
}

/** sRGB (file colours: MTL Kd) -> linear, as glTF base colours are linear. */
export const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4

/**
 * A mesh's materials as slots, `triangleSlots[t]` being triangle t's. A single slot keeps its
 * name for a later merge (split mode "single"), and stays a single-colour asset otherwise.
 */
export function slotFields(
  slots: readonly SourceSlot[],
  triangleSlots: Uint16Array
): Required<Pick<SourceMesh, "color" | "slots" | "triangleSlots">> {
  const color = slots.length === 1 ? (slots[0]?.color ?? null) : null
  return { color, slots: [...slots], triangleSlots }
}

/**
 * Copies a three.js geometry into a SourceMesh. `trustNormals`: keep the file's normals
 * (authored smooth/hard edges); otherwise they are rebuilt (STL facet normals carry nothing).
 */
export function fromGeometry(
  geometry: BufferGeometry,
  name: string,
  path: string[],
  color: Vec3 | null,
  trustNormals: boolean
): ParsedMesh {
  const positions = copyVec3(geometry.getAttribute("position"))
  const normals =
    trustNormals && geometry.hasAttribute("normal")
      ? copyVec3(geometry.getAttribute("normal"))
      : undefined
  const index = geometry.getIndex()
  return {
    name,
    path,
    positions,
    ...(normals && normals.length === positions.length ? { normals } : {}),
    ...(index ? { indices: Uint32Array.from(index.array) } : {}),
    color,
  }
}

/** Per-element copy: works for interleaved and normalized (quantized) attributes too. */
export function copyVec3(attribute: {
  count: number
  getX(i: number): number
  getY(i: number): number
  getZ(i: number): number
}): Float32Array {
  const out = new Float32Array(3 * attribute.count)
  for (let i = 0; i < attribute.count; i++) {
    out[3 * i] = attribute.getX(i)
    out[3 * i + 1] = attribute.getY(i)
    out[3 * i + 2] = attribute.getZ(i)
  }
  return out
}
