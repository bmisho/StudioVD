import type { Object3D } from "three"
import type { PartId } from "@/core/schema"

/**
 * The scene object of each mounted part, so test mode can write live physics poses into it
 * (transient state, CLAUDE.md §4 kind 3: never through React or the store). Observable for
 * the few views that attach to a part's object (the transform gizmo).
 */
const objects = new Map<PartId, Object3D>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function registerPartObject(id: PartId, object: Object3D): () => void {
  objects.set(id, object)
  notify()
  return () => {
    if (objects.get(id) === object) {
      objects.delete(id)
      notify()
    }
  }
}

export function partObject(id: PartId): Object3D | undefined {
  return objects.get(id)
}

export function subscribePartObjects(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
