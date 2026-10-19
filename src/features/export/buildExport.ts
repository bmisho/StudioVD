import {
  BufferGeometry,
  Color,
  FrontSide,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  Scene,
  type Material,
} from "three"
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js"
import { STLExporter } from "three/examples/jsm/exporters/STLExporter.js"
import { MM_PER_UNIT } from "@/core/units"

/** One part as it is drawn right now: geometry in part space and its world matrix (mm). */
export interface ExportItem {
  name: string
  geometry: BufferGeometry
  /** One per draw group of the geometry (material slots), or one for all of it. */
  material: Material | Material[]
  matrixWorld: Matrix4
}

const KEEP = new Set(["position", "normal", "color"])

/** A world-space copy with only the standard attributes (no outline normals, no BVH). */
function bake(item: ExportItem, scale: number): BufferGeometry {
  const out = new BufferGeometry()
  for (const [name, attribute] of Object.entries(item.geometry.attributes)) {
    if (KEEP.has(name)) out.setAttribute(name, attribute.clone())
  }
  const index = item.geometry.getIndex()
  if (index) out.setIndex(index.clone())
  // One glTF primitive per material slot (GLTFExporter ignores groups with one material).
  for (const g of item.geometry.groups) out.addGroup(g.start, g.count, g.materialIndex)
  out.applyMatrix4(new Matrix4().makeScale(scale, scale, scale).multiply(item.matrixWorld))
  return out
}

/**
 * What glTF can describe of a part's material: PBR values plus transmission, IOR, thickness,
 * clearcoat and emissive strength (GLTFExporter writes the KHR_materials_* extensions).
 * Texture maps are left out: they are projected in the shader, and assets have no UVs.
 */
function exportMaterial(material: Material, scale: number): MeshPhysicalMaterial {
  const source = material as Partial<MeshPhysicalMaterial>
  const number = (v: number | undefined, fallback: number) => (typeof v === "number" ? v : fallback)
  return new MeshPhysicalMaterial({
    name: material.name,
    color: source.color instanceof Color ? source.color.clone() : new Color(0.8, 0.8, 0.8),
    metalness: number(source.metalness, 0),
    roughness: number(source.roughness, 0.55),
    opacity: material.opacity,
    transparent: material.transparent,
    transmission: number(source.transmission, 0),
    ior: number(source.ior, 1.5),
    // Volume thickness is in mesh units: scaled like the geometry (mm -> m for glTF).
    thickness: number(source.thickness, 0) * scale,
    clearcoat: number(source.clearcoat, 0),
    clearcoatRoughness: number(source.clearcoatRoughness, 0),
    emissive: source.emissive instanceof Color ? source.emissive.clone() : new Color(0, 0, 0),
    emissiveIntensity: number(source.emissiveIntensity, 1),
    vertexColors: material.vertexColors,
    side: FrontSide,
  })
}

function sceneOf(
  items: readonly ExportItem[],
  scale: number
): { scene: Scene; dispose: () => void } {
  const scene = new Scene()
  const disposables: { dispose: () => void }[] = []
  for (const item of items) {
    const geometry = bake(item, scale)
    const material = Array.isArray(item.material)
      ? item.material.map((m) => exportMaterial(m, scale))
      : exportMaterial(item.material, scale)
    const mesh = new Mesh(geometry, material)
    mesh.name = item.name
    scene.add(mesh)
    disposables.push(geometry, ...(Array.isArray(material) ? material : [material]))
  }
  return { scene, dispose: () => disposables.forEach((d) => d.dispose()) }
}

/** Binary glTF in metres (glTF 2.0 units), one named node per part. */
export async function exportGlb(items: readonly ExportItem[]): Promise<Uint8Array> {
  const { scene, dispose } = sceneOf(items, 1 / MM_PER_UNIT.m)
  try {
    const result = await new GLTFExporter().parseAsync(scene, { binary: true })
    if (!(result instanceof ArrayBuffer)) throw new Error("The glTF exporter returned JSON.")
    return new Uint8Array(result)
  } finally {
    dispose()
  }
}

/** Binary STL in millimetres (STL has no unit; mm is what CAD and slicers assume). */
export function exportStl(items: readonly ExportItem[]): Uint8Array {
  const { scene, dispose } = sceneOf(items, 1)
  try {
    const view = new STLExporter().parse(scene, { binary: true })
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  } finally {
    dispose()
  }
}
