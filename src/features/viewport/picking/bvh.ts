import { BufferGeometry, Mesh } from "three"
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh"

let installed = false

/**
 * three-mesh-bvh, installed once (CLAUDE.md §1: every raycast against part meshes uses a BVH).
 * Mesh.raycast falls back to three's brute force for geometries without a boundsTree.
 */
export function installBvh(): void {
  if (installed) return
  installed = true
  BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
  BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
  Mesh.prototype.raycast = acceleratedRaycast
}

/** Builds the BVH once per geometry (loaded assets bring theirs from the asset worker). */
export function ensureBoundsTree(geometry: BufferGeometry): void {
  installBvh()
  if (!geometry.boundsTree) geometry.computeBoundsTree()
}
