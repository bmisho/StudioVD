import type { Mesh, Object3D } from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import type { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"
import { decodeUri } from "@/core/import/externalRefs"
import type { Vec3 } from "@/core/schema"
import { fromGeometry, type ParsedMesh } from "./parsedMesh"
import { glbChunks, packGlb, stripTextures } from "./gltfJson"

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
    return collectMeshes(gltf.scene, input.fileName.replace(/\.[^.]+$/, ""))
  } finally {
    for (const url of blobUrls) URL.revokeObjectURL(url)
    input.draco?.dispose()
  }
}

/** Every mesh in world space (node transforms applied), named after its node. */
export function collectMeshes(root: Object3D, fallbackName: string): ParsedMesh[] {
  root.updateMatrixWorld(true)
  const out: ParsedMesh[] = []
  root.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    // applyMatrix4 transforms normals too (normal matrix); a mirroring transform also needs
    // the winding reversed, or the triangles would face inward.
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
    if (mesh.matrixWorld.determinant() < 0) flipWinding(geometry)
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    const c = (material as { color?: { r: number; g: number; b: number } } | undefined)?.color
    const color: Vec3 | null = c ? [c.r, c.g, c.b] : null
    const path: string[] = []
    for (let p = mesh.parent; p && p !== root; p = p.parent) if (p.name) path.unshift(p.name)
    out.push(fromGeometry(geometry, mesh.name || fallbackName, path, color, true))
    geometry.dispose()
  })
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
