import { useFrame, useThree } from "@react-three/fiber"
import { useEffect, useRef, type RefObject } from "react"
import { Plane, Vector2, Vector3 } from "three"
import { eventElement } from "@/features/viewport/camera/useControlsLifecycle"
import { useViewport } from "@/features/viewport/ViewportContext"
import type { PhysicsScene } from "./buildPhysicsScene"
import { beginDrag, type Drag } from "./physicsStep"

const ndc = new Vector2()
const hit = new Vector3()

/**
 * Test-mode mouse drag (PLAN 3.9): a primary press on a movable part grabs it at the hit
 * point; the cursor then moves a target on the camera-facing plane through that point, and
 * the drag spring (physicsStep) pulls the part toward it. Pointer capture keeps the drag
 * alive outside the canvas. The target is re-projected every frame, so orbiting with the
 * middle button while holding a part keeps it under the cursor.
 */
export function useDragInput(
  scene: RefObject<PhysicsScene | null>,
  drag: RefObject<Drag | null>
): void {
  const { partGrab } = useViewport()
  const connected = useThree((s): unknown => s.events.connected)
  const gl = useThree((s) => s.gl)
  const get = useThree((s) => s.get)
  const cursor = useRef<{ x: number; y: number } | null>(null)
  const plane = useRef(new Plane())

  useEffect(() => {
    const el = eventElement(connected, gl.domElement)
    const move = (e: PointerEvent) => {
      cursor.current = { x: e.clientX, y: e.clientY }
    }
    const end = () => {
      drag.current = null
      cursor.current = null
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", end)
      window.removeEventListener("pointercancel", end)
      window.removeEventListener("blur", end)
    }
    partGrab.current = (item, e) => {
      const entry = item.kind === "part" ? scene.current?.bodies.get(item.id) : undefined
      if (!entry?.body.isDynamic()) return
      drag.current = beginDrag(entry, [e.point.x, e.point.y, e.point.z])
      const forward = get().camera.getWorldDirection(new Vector3())
      plane.current.setFromNormalAndCoplanarPoint(forward, e.point)
      cursor.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }
      el.setPointerCapture(e.nativeEvent.pointerId)
      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", end)
      window.addEventListener("pointercancel", end)
      window.addEventListener("blur", end)
    }
    return () => {
      partGrab.current = null
      end()
    }
  }, [connected, gl, get, partGrab, scene, drag])

  useFrame(({ camera, raycaster }) => {
    const current = drag.current
    const at = cursor.current
    if (!current || !at) return
    const rect = eventElement(connected, gl.domElement).getBoundingClientRect()
    ndc.set(((at.x - rect.left) / rect.width) * 2 - 1, -((at.y - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    if (raycaster.ray.intersectPlane(plane.current, hit)) current.targetMm = [hit.x, hit.y, hit.z]
  })
}
