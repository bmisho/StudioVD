import type { RootState } from "@react-three/fiber"
import { Plane, Raycaster, Vector2, Vector3, type Object3D } from "three"
import type { PartId, Vec3 } from "@/core/schema"
import { pickRefOf } from "./pickTarget"

/** What lies under a point of the 3D view (PLAN 9.5 placement). */
export interface PointerProbe {
  /** The nearest part's surface: world point and outward world normal. */
  surface: { partId: PartId; point: Vec3; normal: Vec3 } | null
  /** Where the ray meets the ground plane (y = 0) in front of the camera. */
  ground: Vec3 | null
}

const raycaster = new Raycaster()
raycaster.firstHitOnly = true
const ndc = new Vector2()
const groundPlane = new Plane(new Vector3(0, 1, 0), 0)
const v = new Vector3()
const tuple = (p: Vector3): Vec3 => [p.x, p.y, p.z]

/** The probe under client point (x, y), or null when it is not over the canvas's area. */
export function probePointer(
  state: Pick<RootState, "gl" | "camera">,
  root: Object3D | null,
  x: number,
  y: number
): PointerProbe | null {
  const rect = state.gl.domElement.getBoundingClientRect()
  const u = (x - rect.left) / rect.width
  const w = (y - rect.top) / rect.height
  if (!(u >= 0 && u <= 1 && w >= 0 && w <= 1)) return null
  raycaster.setFromCamera(ndc.set(2 * u - 1, 1 - 2 * w), state.camera)
  let surface: PointerProbe["surface"] = null
  for (const hit of root ? raycaster.intersectObject(root, true) : []) {
    const item = pickRefOf(hit.object)
    if (item?.kind !== "part" || !hit.face) continue
    const normal = v.copy(hit.face.normal).transformDirection(hit.object.matrixWorld)
    surface = { partId: item.id, point: tuple(hit.point), normal: tuple(normal) }
    break
  }
  const onGround = raycaster.ray.intersectPlane(groundPlane, v)
  return { surface, ground: onGround ? tuple(onGround) : null }
}

/** Client px of a world point and its depth (-1 near .. 1 far); null behind the camera. */
export function worldToClient(
  state: Pick<RootState, "gl" | "camera">,
  p: Vec3
): { x: number; y: number; depth: number } | null {
  v.set(p[0], p[1], p[2]).project(state.camera)
  if (v.z > 1 || v.z < -1) return null
  const rect = state.gl.domElement.getBoundingClientRect()
  return {
    x: rect.left + ((v.x + 1) / 2) * rect.width,
    y: rect.top + ((1 - v.y) / 2) * rect.height,
    depth: v.z,
  }
}
