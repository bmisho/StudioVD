import { Box3, type BufferGeometry, type Mesh, type Object3D, type Sphere } from "three"
import { isOverlay } from "../thumbnail/overlay"
import { DEFAULT_STAGE } from "./cameraConfig"

const tmp = new Box3()
const isMesh = (o: Object3D): o is Mesh<BufferGeometry> => (o as Mesh).isMesh === true

/**
 * Bounding box of the visible meshes under `root` (the parts group: no grid, gizmos or view
 * cube), leaving out overlays drawn on parts (highlights, anchor glyphs: a glyph is sized in
 * screen pixels, so far out it would be metres wide). Box3.setFromObject would include hidden
 * objects.
 */
export function visiblePartsBox(root: Object3D | null, out: Box3): Box3 {
  out.makeEmpty()
  if (!root) return out
  root.updateWorldMatrix(true, true)
  const visit = (o: Object3D) => {
    if (!o.visible || isOverlay(o)) return
    if (isMesh(o)) {
      const geometry = o.geometry
      if (!geometry.boundingBox) geometry.computeBoundingBox()
      if (geometry.boundingBox)
        out.union(tmp.copy(geometry.boundingBox).applyMatrix4(o.matrixWorld))
    }
    for (const child of o.children) visit(child)
  }
  visit(root)
  return out
}

/** Sphere around the parts and, when given, the visible grid disc; the default stage if empty. */
export function viewBounds(partsBox: Box3, grid: Sphere | null, out: Sphere): Sphere {
  const box = partsBox.isEmpty() ? DEFAULT_STAGE : partsBox
  box.getBoundingSphere(out)
  if (grid) out.union(grid)
  return out
}
