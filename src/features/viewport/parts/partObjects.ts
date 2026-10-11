import type { Object3D } from "three"
import type { PartId } from "@/core/schema"

/**
 * The scene object of each mounted part, so test mode can write live physics poses into it
 * (transient state, CLAUDE.md §4 kind 3: never through React or the store).
 */
const objects = new Map<PartId, Object3D>()

export function registerPartObject(id: PartId, object: Object3D): () => void {
  objects.set(id, object)
  return () => {
    if (objects.get(id) === object) objects.delete(id)
  }
}

export function partObject(id: PartId): Object3D | undefined {
  return objects.get(id)
}
