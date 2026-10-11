import { BufferAttribute, type BufferGeometry } from "three"
import { computeHullNormals } from "@/core/math/hullNormals"
import { HULL_NORMAL } from "./hullOutlineMaterial"

/**
 * Adds the outline attribute to `geometry` once (in place, so the part and its outline share
 * one GPU buffer set). O(triangles), but only bounding boxes need it: loaded assets carry the
 * attribute from their GLB (`_HULLNORMAL`, computed at import), so for them this is a lookup.
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
