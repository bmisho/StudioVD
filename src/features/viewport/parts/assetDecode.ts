import { BufferAttribute, BufferGeometry } from "three"
import { MeshBVH, type MeshBVHOptions, type SerializedBVH } from "three-mesh-bvh"
import { decodeGlb } from "@/core/geometry/glbRead"
import type { FaceInfo } from "@/core/geometry/meshData"
import type { AssetSlot } from "@/core/geometry/slots"

/** The 0.8.3 typings omit `indirect`, which the library implements (MeshBVH.js). */
type IndirectBuffer = Uint32Array | Uint16Array
type IndirectOptions = MeshBVHOptions & { indirect: boolean }
type IndirectSerialized = SerializedBVH & { indirectBuffer: IndirectBuffer | null }

/** A decoded asset in transferable typed arrays, with its serialized BVH. */
export interface DecodedAsset {
  positions: Float32Array
  normals: Float32Array
  hullNormals: Float32Array
  colors: Float32Array | null
  indices: Uint32Array
  faces: FaceInfo[]
  /** Material slots in index order (one for a single-colour mesh). */
  slots: AssetSlot[]
  bvh: { roots: ArrayBuffer[]; indirectBuffer: IndirectBuffer | null }
}

/**
 * Decodes a normalized GLB and builds its BVH (runs in the asset worker). The BVH is
 * "indirect": it does not reorder the index buffer, so B-rep face ranges and hit face indices
 * keep referring to the stored triangle order (Phase 7 picks faces by triangle index).
 */
export function decodeAsset(bytes: Uint8Array): DecodedAsset {
  const { mesh, hullNormals, faces, slots } = decodeGlb(bytes)
  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new BufferAttribute(mesh.positions, 3))
  geometry.setIndex(new BufferAttribute(mesh.indices, 1))
  const options: IndirectOptions = { indirect: true }
  const bvh = MeshBVH.serialize(new MeshBVH(geometry, options), {
    cloneBuffers: false,
  }) as IndirectSerialized
  return {
    positions: mesh.positions,
    normals: mesh.normals,
    hullNormals,
    colors: mesh.colors ?? null,
    indices: mesh.indices,
    faces,
    slots,
    bvh: { roots: bvh.roots, indirectBuffer: bvh.indirectBuffer },
  }
}

/** Every distinct buffer to transfer (a buffer listed twice makes postMessage throw). */
export function transferablesOf(asset: DecodedAsset): ArrayBuffer[] {
  const buffers = [
    asset.positions.buffer,
    asset.normals.buffer,
    asset.hullNormals.buffer,
    asset.colors?.buffer,
    asset.indices.buffer,
    asset.bvh.indirectBuffer?.buffer,
    ...asset.bvh.roots,
  ]
  return [...new Set(buffers.filter((b): b is ArrayBuffer => b instanceof ArrayBuffer))]
}

/** Main thread: the render geometry, with the BVH attached (no rebuild). */
export function toGeometry(asset: DecodedAsset, hullNormalName: string): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute("position", new BufferAttribute(asset.positions, 3))
  geometry.setAttribute("normal", new BufferAttribute(asset.normals, 3))
  geometry.setAttribute(hullNormalName, new BufferAttribute(asset.hullNormals, 3))
  if (asset.colors) geometry.setAttribute("color", new BufferAttribute(asset.colors, 3))
  geometry.setIndex(new BufferAttribute(asset.indices, 1))
  // One draw group per slot (index order), used once a part gives its slots their own materials.
  if (asset.slots.length > 1)
    for (const [i, s] of asset.slots.entries())
      geometry.addGroup(3 * s.first, 3 * (s.last - s.first + 1), i)
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  const serialized: IndirectSerialized = {
    roots: asset.bvh.roots,
    index: asset.indices,
    indirectBuffer: asset.bvh.indirectBuffer,
  }
  geometry.boundsTree = MeshBVH.deserialize(serialized, geometry, { setIndex: false })
  return geometry
}
