import type { RootState } from "@react-three/fiber"
import { Raycaster, Vector2, type Object3D } from "three"
import type { PartId } from "@/core/schema"
import { pickRefOf } from "./pickTarget"

const raycaster = new Raycaster()
raycaster.firstHitOnly = true // three-mesh-bvh: nearest hit per mesh
const ndc = new Vector2()

/**
 * The part under a point of the page (client px), for drops from outside the canvas (a
 * material dragged from the sidebar, PLAN 6.4). Same picking as the viewport's own pointer
 * events: the parts root only, nearest hit, the part that owns it.
 */
export function partAtPoint(
  state: Pick<RootState, "gl" | "camera">,
  root: Object3D | null,
  clientX: number,
  clientY: number
): PartId | null {
  const rect = state.gl.domElement.getBoundingClientRect()
  const x = (clientX - rect.left) / rect.width
  const y = (clientY - rect.top) / rect.height
  if (!root || !(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return null
  raycaster.setFromCamera(ndc.set(2 * x - 1, 1 - 2 * y), state.camera)
  for (const hit of raycaster.intersectObject(root, true)) {
    const item = pickRefOf(hit.object)
    if (item) return item.kind === "part" ? item.id : null
  }
  return null
}
