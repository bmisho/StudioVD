import type { Occt, OcctNode, OcctResult } from "occt-import-js"
import { STEP_QUALITY, type StepQuality } from "@/core/import/importOptions"
import type { ParsedMesh } from "./parsedMesh"

/**
 * STEP/IGES through occt-import-js (PLAN 4.4). occt writes millimetres (linearUnit), applies
 * assembly placements itself (every mesh comes in assembly coordinates, referenced once) and
 * keeps the B-rep face ranges, which become the asset's faces. Colours are already linear RGB.
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
        color: mesh.color ? [mesh.color[0], mesh.color[1], mesh.color[2]] : null,
      })
    }
    for (const child of node.children) walk(child, here)
  }
  walk(result.root, [])
  return out
}
