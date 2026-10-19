import type { Occt, OcctMesh, OcctNode, OcctResult } from "occt-import-js"
import { slotCollector } from "@/core/geometry/slots"
import { STEP_QUALITY, type StepQuality } from "@/core/import/importOptions"
import type { Vec3 } from "@/core/schema"
import { slotFields, type ParsedMesh } from "./parsedMesh"

/**
 * STEP/IGES through occt-import-js (PLAN 4.4). occt writes millimetres (linearUnit), applies
 * assembly placements itself (every mesh comes in assembly coordinates, referenced once) and
 * keeps the B-rep face ranges, which become the asset's faces. Colours are already linear RGB;
 * a face's own colour wins over its body's, and each distinct colour becomes a material slot.
 * Runs only in the import worker (CLAUDE.md §6): parsing large files takes seconds.
 */
export function parseCad(
  occt: Occt,
  bytes: Uint8Array,
  format: "step" | "iges",
  quality: StepQuality,
  fileName: string
): ParsedMesh[] {
  const params = {
    linearUnit: "millimeter" as const,
    linearDeflectionType: "bounding_box_ratio" as const,
    ...STEP_QUALITY[quality],
  }
  const result =
    format === "step" ? occt.ReadStepFile(bytes, params) : occt.ReadIgesFile(bytes, params)
  if (!result.success) throw new Error(`Could not read ${fileName}: occt reported a failure.`)
  return meshesOf(result, fileName)
}

/** Walks the product tree; each mesh becomes one part named after its body (or its node). */
export function meshesOf(result: OcctResult, fileName: string): ParsedMesh[] {
  const out: ParsedMesh[] = []
  const seen = new Set<number>()
  const walk = (node: OcctNode, path: string[]) => {
    const here = node.name ? [...path, node.name] : path
    for (const i of node.meshes) {
      const mesh = result.meshes[i]
      if (!mesh || seen.has(i)) continue
      seen.add(i)
      const indices = Uint32Array.from(mesh.index.array)
      out.push({
        name: mesh.name || node.name || fileName,
        // The node that owns the mesh names the part; groups are its ancestors.
        path: node.meshes.length === 1 && node.name ? path : here,
        positions: Float32Array.from(mesh.attributes.position.array),
        ...(mesh.attributes.normal
          ? { normals: Float32Array.from(mesh.attributes.normal.array) }
          : {}),
        indices,
        faceRanges: mesh.brep_faces.map(({ first, last }) => ({ first, last })),
        ...faceSlots(mesh, indices.length / 3),
      })
    }
    for (const child of node.children) walk(child, here)
  }
  walk(result.root, [])
  return out
}

const rgb = (c: readonly number[] | null | undefined): Vec3 | null =>
  c ? [c[0] ?? 0, c[1] ?? 0, c[2] ?? 0] : null

/** Slots by colour: each face's own, else its body's (occt reports null for "inherited"). */
function faceSlots(mesh: OcctMesh, triangles: number) {
  const slots = slotCollector()
  const slotOf = new Int32Array(triangles).fill(-1)
  for (const face of mesh.brep_faces) {
    const slot = slots.add(null, rgb(face.color ?? mesh.color))
    slotOf.fill(slot, Math.max(0, face.first), Math.min(triangles, face.last + 1))
  }
  // Triangles outside every face (occt should leave none) take the body colour.
  const rest = slotOf.includes(-1) ? slots.add(null, rgb(mesh.color)) : 0
  return slotFields(
    slots.slots,
    Uint16Array.from(slotOf, (s) => (s < 0 ? rest : s))
  )
}
