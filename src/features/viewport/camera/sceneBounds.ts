import { Box3, type BufferGeometry, type Mesh, type Object3D, type Sphere } from "three"
import { DEFAULT_STAGE } from "./cameraConfig"

const tmp = new Box3()
const isMesh = (o: Object3D): o is Mesh<BufferGeometry> => (o as Mesh).isMesh === true

/**
 * Bounding box of the visible meshes under `root` (the parts group: no grid, gizmos or view
 * cube). Box3.setFromObject would include hidden objects.
 */
export function visiblePartsBox(root: Object3D | null, out: Box3): Box3 {
  out.makeEmpty()
  if (!root) return out
  root.updateWorldMatrix(true, true)
  root.traverseVisible((o) => {
    if (!isMesh(o)) return
    const geometry = o.geometry
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    if (geometry.boundingBox) out.union(tmp.copy(geometry.boundingBox).applyMatrix4(o.matrixWorld))
  })
  return out
}

/** Sphere around the parts and, when given, the visible grid disc; the default stage if empty. */
export function viewBounds(partsBox: Box3, grid: Sphere | null, out: Sphere): Sphere {
  const box = partsBox.isEmpty() ? DEFAULT_STAGE : partsBox
  box.getBoundingSphere(out)
  if (grid) out.union(grid)
  return out
}
