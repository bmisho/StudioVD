import { useLayoutEffect, type RefObject } from "react"
import type { Material, Object3D } from "three"

function untone(material: Material | Material[]): void {
  for (const m of Array.isArray(material) ? material : [material]) {
    if (m.toneMapped) {
      m.toneMapped = false
      m.needsUpdate = true
    }
  }
}

/**
 * drei's view-cube faces are tone-mapped (white renders as #f0f0f0 under Neutral), so
 * gizmo colours would drift from the theme tokens. Re-run when the gizmo rebuilds.
 */
export function useUntonedMaterials(root: RefObject<Object3D | null>, rebuildKey: unknown): void {
  useLayoutEffect(() => {
    root.current?.traverse((o) => {
      const material = (o as { material?: Material | Material[] }).material // meshes and sprites
      if (material) untone(material)
    })
  }, [root, rebuildKey])
}
