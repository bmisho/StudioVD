import type { Object3D } from "three"
import type { SelectionItem } from "@/store/session/sessionStore"

/**
 * Which selectable entity a 3D object belongs to. A WeakMap, not `userData`: userData is
 * written into exported GLB `extras` (GLTFExporter), and this is session wiring, not data.
 */
const pickRefs = new WeakMap<Object3D, SelectionItem>()

/** Marks `object` (usually a part's root group) as the pick target for its whole subtree. */
export function setPickRef(object: Object3D, item: SelectionItem): () => void {
  pickRefs.set(object, item)
  return () => {
    if (pickRefs.get(object) === item) pickRefs.delete(object)
  }
}

/** The nearest marked ancestor of a raycast hit (the hit object itself included), or null. */
export function pickRefOf(object: Object3D | null): SelectionItem | null {
  for (let o = object; o !== null; o = o.parent) {
    const item = pickRefs.get(o)
    if (item) return item
  }
  return null
}

/** Leaf overlays (highlights, glyphs) opt out of picking: three never raycasts them. */
export function noRaycast(): void {}
