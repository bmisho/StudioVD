import { BufferAttribute, type BufferGeometry } from "three"
import { computeHullNormals } from "@/core/math/hullNormals"
import { HULL_NORMAL } from "./hullOutlineMaterial"

/**
 * Adds the outline attribute to `geometry` once (in place, so the part and its outline share
 * one GPU buffer set). O(triangles): fine for Phase 3 boxes; Phase 4 computes it in the import
 * worker and stores it in the normalized GLB (`_HULLNORMAL`), so this becomes a lookup.
 */
export function ensureHullNormals(geometry: BufferGeometry): BufferGeometry {
  if (geometry.getAttribute(HULL_NORMAL)) return geometry
  const position = geometry.getAttribute("position")
  const normal = geometry.getAttribute("normal")
  const hull = computeHullNormals(
    position.array,
    geometry.index ? geometry.index.array : null,
    normal ? normal.array : null
  )
  geometry.setAttribute(HULL_NORMAL, new BufferAttribute(hull, 3))
  return geometry
}
