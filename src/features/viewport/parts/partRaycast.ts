import { Mesh, MeshBasicMaterial, type Intersection, type Raycaster } from "three"

/** Front faces only, whatever the part is drawn with (X-ray is double-sided). */
const PICK_MATERIAL = new MeshBasicMaterial()

/**
 * Raycast for part meshes: the same hits in every display mode, and with one material even
 * when the part has one per slot (three-mesh-bvh would take every slot's side from the first
 * group). Wireframe hides the faces with `visible`, which raycasting ignores, so they stay
 * pickable. The hit's `face.materialIndex` is not the slot: use `slotAt(faceIndex)`.
 */
export function partRaycast(this: Mesh, raycaster: Raycaster, intersects: Intersection[]): void {
  const material = this.material
  this.material = PICK_MATERIAL
  try {
    Mesh.prototype.raycast.call(this, raycaster, intersects) // the BVH raycast once installed
  } finally {
    this.material = material
  }
}
