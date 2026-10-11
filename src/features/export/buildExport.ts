import {
  BufferGeometry,
  Color,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
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
  material: Material
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
  out.applyMatrix4(new Matrix4().makeScale(scale, scale, scale).multiply(item.matrixWorld))
  return out
}

/** A plain material glTF can describe: the part's colour, roughness and vertex colours. */
function exportMaterial(material: Material): MeshStandardMaterial {
  const source = material as Partial<MeshStandardMaterial>
  return new MeshStandardMaterial({
    color: source.color instanceof Color ? source.color.clone() : new Color(0.8, 0.8, 0.8),
    metalness: source.metalness ?? 0,
    roughness: source.roughness ?? 0.55,
    vertexColors: source.vertexColors ?? false,
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
    const material = exportMaterial(item.material)
    const mesh = new Mesh(geometry, material)
    mesh.name = item.name
    scene.add(mesh)
    disposables.push(geometry, material)
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
