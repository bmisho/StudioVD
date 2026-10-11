import type { Mesh, Object3D } from "three"
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js"
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js"
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js"
import type { Vec3 } from "@/core/schema"
import { fromGeometry, srgbToLinear, type ParsedMesh } from "./parsedMesh"

// STL and OBJ: plain parsers, no DOM, so they run in the import worker.

/** Binary or ASCII STL: one triangle soup, facet normals discarded (rebuilt with creases). */
export function parseStl(bytes: ArrayBuffer, name: string): ParsedMesh[] {
  const geometry = new STLLoader().parse(bytes)
  return [fromGeometry(geometry, name, [], null, false)]
}

/**
 * OBJ (+ optional MTL text): one mesh per object/group, colour from the material's Kd (sRGB in
 * MTL files, linearized here). Textures are ignored (materials arrive in Phase 6).
 */
export function parseObj(text: string, name: string, mtlText?: string): ParsedMesh[] {
  const kd = new Map<string, Vec3>()
  if (mtlText) {
    const info = new MTLLoader().parse(mtlText, "").materialsInfo
    for (const [material, entry] of Object.entries(info)) {
      const c = entry.kd
      if (Array.isArray(c) && c.length >= 3) {
        kd.set(material, [
          srgbToLinear(c[0] ?? 0),
          srgbToLinear(c[1] ?? 0),
          srgbToLinear(c[2] ?? 0),
        ])
      }
    }
  }
  const root = new OBJLoader().parse(text)
  const out: ParsedMesh[] = []
  root.updateMatrixWorld(true)
  root.traverse((object: Object3D) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    const color = (material && kd.get(material.name)) ?? null
    const partName = mesh.name || name
    out.push(fromGeometry(mesh.geometry, partName, [], color, true))
  })
  return out
}
