import { BufferAttribute, BufferGeometry, type Material, type Mesh, type Object3D } from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import type { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"
import { decodeUri } from "@/core/import/externalRefs"
import type { Vec3 } from "@/core/schema"
import { glbChunks, packGlb, stripTextures } from "./gltfJson"
import { mergeMeshes } from "./mergeMeshes"
import { copyVec3, fromGeometry, type ParsedMesh } from "./parsedMesh"

/** What GLTFLoader's `parser.associations` records per object: glTF indices. */
interface Association {
  meshes?: number
  primitives?: number
  materials?: number
  nodes?: number
}
export type Associations = ReadonlyMap<unknown, Association>

export interface GltfInput {
  bytes: ArrayBuffer
  fileName: string
  /** Bytes of a resource a .gltf refers to by relative URI (its .bin buffers). */
  resource?: (uri: string) => Promise<ArrayBuffer>
  draco?: DRACOLoader
  meshopt?: unknown
}

/**
 * glTF / GLB (PLAN 4.3). Textures are stripped from the JSON before parsing: materials arrive
 * in Phase 6, and without images GLTFLoader needs no DOM, so this runs in the import worker.
 * External .bin buffers are read through `resource` and handed over as blob URLs, so the
 * loader never touches the network (CLAUDE.md §6). Node transforms are baked into the
 * vertices (the part is placed by the recentring offset); units are metres (glTF 2.0).
 */
export async function parseGltf(input: GltfInput): Promise<ParsedMesh[]> {
  const isGlb = new DataView(input.bytes).getUint32(0, true) === 0x46546c67
  const blobUrls: string[] = []
  const loader = new GLTFLoader()
  if (input.draco) loader.setDRACOLoader(input.draco)
  if (input.meshopt)
    loader.setMeshoptDecoder(input.meshopt as Parameters<GLTFLoader["setMeshoptDecoder"]>[0])
  try {
    let data: ArrayBuffer | string
    if (isGlb) {
      const { json, bin } = glbChunks(new Uint8Array(input.bytes))
      data = packGlb(stripTextures(json), bin).slice().buffer
    } else {
      const json = stripTextures(JSON.parse(new TextDecoder().decode(input.bytes)) as unknown)
      const buffers = (json as { buffers?: { uri?: string }[] }).buffers ?? []
      for (const buffer of buffers) {
        if (!buffer.uri || buffer.uri.startsWith("data:")) continue
        if (!input.resource)
          throw new Error(`${input.fileName} needs ${buffer.uri}, which is not available.`)
        const url = URL.createObjectURL(new Blob([await input.resource(decodeUri(buffer.uri))]))
        blobUrls.push(url)
        buffer.uri = url
      }
      data = JSON.stringify(json)
    }
    const gltf = await loader.parseAsync(data, "")
    const associations = gltf.parser.associations as Associations
    return collectMeshes(gltf.scene, input.fileName.replace(/\.[^.]+$/, ""), associations)
  } finally {
    for (const url of blobUrls) URL.revokeObjectURL(url)
    input.draco?.dispose()
  }
}

/** The name as the file wrote it: GLTFLoader sanitizes `name` ("Bolt M6" -> "Bolt_M6"). */
const nameOf = (o: Object3D): string =>
  typeof o.userData.name === "string" ? o.userData.name : o.name

/**
 * Float32 copies of position, normal and index. Quantized attributes (KHR_mesh_quantization:
 * int16/uint16, often normalized) must not be transformed in place: their node matrix
 * dequantizes them, and world coordinates would wrap or truncate in the integer arrays.
 */
function floatGeometry(source: BufferGeometry): BufferGeometry {
  const out = new BufferGeometry()
  out.setAttribute("position", new BufferAttribute(copyVec3(source.getAttribute("position")), 3))
  if (source.hasAttribute("normal"))
    out.setAttribute("normal", new BufferAttribute(copyVec3(source.getAttribute("normal")), 3))
  const index = source.getIndex()
  if (index) out.setIndex(new BufferAttribute(Uint32Array.from(index.array), 1))
  return out
}

/**
 * GLTFLoader makes a glTF mesh with several primitives a Group of child Meshes, one per
 * primitive: such a Mesh belongs to its parent, which becomes one part with a slot each.
 */
function primitivesOwner(mesh: Mesh, associations: Associations): Object3D | null {
  const own = associations.get(mesh)
  const parent = mesh.parent
  const group = parent ? associations.get(parent) : undefined
  if (!parent || !own || !group || own.primitives === undefined || own.nodes !== undefined)
    return null
  return group.meshes === own.meshes && group.primitives === undefined ? parent : null
}

/** A primitive's slot: its glTF material by name (or index), or "Default" when it has none. */
function slotOf(material: Material | undefined, associations: Associations) {
  const index = material ? associations.get(material)?.materials : undefined
  const c = (material as { color?: { r: number; g: number; b: number } } | undefined)?.color
  const color: Vec3 | null = c ? [c.r, c.g, c.b] : null
  if (index === undefined) return { name: "Default", color }
  return { name: material?.name || `material_${index}`, color }
}

/** One primitive in world space (node transforms applied), its material as its one slot. */
function worldMesh(mesh: Mesh, name: string, path: string[], associations: Associations) {
  // applyMatrix4 transforms normals too (normal matrix); a mirroring transform also needs
  // the winding reversed, or the triangles would face inward.
  const geometry = floatGeometry(mesh.geometry).applyMatrix4(mesh.matrixWorld)
  if (mesh.matrixWorld.determinant() < 0) flipWinding(geometry)
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  const slot = slotOf(material, associations)
  const parsed = fromGeometry(geometry, name, path, slot.color, true)
  geometry.dispose()
  const triangles = (parsed.indices?.length ?? parsed.positions.length / 3) / 3
  return {
    parsed,
    slotted: { ...parsed, slots: [slot], triangleSlots: new Uint16Array(triangles) },
  }
}

/**
 * One part per glTF mesh, named after its node; the primitives of a mesh are its material
 * slots, named after their glTF materials. Without `associations` (tests), one part per Mesh.
 */
export function collectMeshes(
  root: Object3D,
  fallbackName: string,
  associations: Associations = new Map()
): ParsedMesh[] {
  root.updateMatrixWorld(true)
  const owners = new Map<Object3D, Mesh[]>()
  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const owner = primitivesOwner(mesh, associations) ?? mesh
    owners.set(owner, [...(owners.get(owner) ?? []), mesh])
  })
  const out: ParsedMesh[] = []
  for (const [owner, meshes] of owners) {
    const path: string[] = []
    for (let p = owner.parent; p && p !== root; p = p.parent) if (nameOf(p)) path.unshift(nameOf(p))
    const name = nameOf(owner) || (meshes[0] ? nameOf(meshes[0]) : "") || fallbackName
    const parts = meshes.map((m) => worldMesh(m, name, path, associations))
    const single = parts.length === 1 ? parts[0] : undefined
    out.push(
      single
        ? single.parsed
        : mergeMeshes(
            parts.map((p) => p.slotted),
            name,
            path
          )
    )
  }
  return out
}

function flipWinding(geometry: Mesh["geometry"]): void {
  const index = geometry.getIndex()
  if (!index) {
    geometry.setIndex(Array.from({ length: geometry.getAttribute("position").count }, (_, i) => i))
    flipWinding(geometry)
    return
  }
  for (let t = 0; t < index.count; t += 3) {
    const b = index.getX(t + 1)
    index.setX(t + 1, index.getX(t + 2))
    index.setX(t + 2, b)
  }
}
