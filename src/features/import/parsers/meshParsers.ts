import type { Material, Mesh, Object3D } from "three"
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js"
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js"
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js"
import { slotCollector } from "@/core/geometry/slots"
import type { Vec3 } from "@/core/schema"
import { fromGeometry, slotFields, srgbToLinear, type ParsedMesh } from "./parsedMesh"

// STL and OBJ: plain parsers, no DOM, so they run in the import worker.

/**
 * Binary or ASCII STL: one triangle soup, facet normals discarded (rebuilt with creases). A
 * binary STL with a `COLOR=` header has facet colours (linear, from the loader): one slot each.
 */
export function parseStl(bytes: ArrayBuffer, name: string): ParsedMesh[] {
  const geometry = new STLLoader().parse(bytes)
  const mesh = fromGeometry(geometry, name, [], null, false)
  if (!geometry.hasAttribute("color")) return [mesh]
  const colors = geometry.getAttribute("color")
  const slots = slotCollector()
  const triangleSlots = Uint16Array.from({ length: colors.count / 3 }, (_, t) =>
    slots.add(null, [colors.getX(3 * t), colors.getY(3 * t), colors.getZ(3 * t)])
  )
  return [{ ...mesh, ...slotFields(slots.slots, triangleSlots) }]
}

/**
 * OBJ (+ optional MTL text): one mesh per object/group. Each `usemtl` section is a material
 * slot named after it, coloured by the material's Kd (sRGB in MTL files, linearized here).
 * Textures are ignored.
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
    const parsed = fromGeometry(mesh.geometry, mesh.name || name, [], null, true)
    const triangles = (parsed.indices?.length ?? parsed.positions.length / 3) / 3
    out.push({ ...parsed, ...objSlots(mesh, triangles, kd) })
  })
  return out
}

/** OBJLoader gives a multi-material object one non-indexed geometry with a group per section. */
function objSlots(mesh: Mesh, triangles: number, kd: ReadonlyMap<string, Vec3>) {
  const materials: (Material | undefined)[] = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material]
  const slots = slotCollector()
  const remap = materials.map((m) => slots.add(m?.name || null, (m && kd.get(m.name)) ?? null))
  const triangleSlots = new Uint16Array(triangles).fill(remap[0] ?? 0)
  if (Array.isArray(mesh.material))
    for (const g of mesh.geometry.groups) {
      const first = Math.floor(g.start / 3)
      const end = Math.min(triangles, first + Math.floor(g.count / 3))
      triangleSlots.fill(remap[g.materialIndex ?? 0] ?? 0, first, end)
    }
  return slotFields(slots.slots, triangleSlots)
}
