import { useFrame, useThree } from "@react-three/fiber"
import { useEffect, useRef } from "react"
import { Matrix4 } from "three"

/**
 * R3F raycasts only on DOM pointer events. When the camera moves under a still cursor
 * (wheel zoom-to-cursor, fit-all, view cube, ortho toggle) the hover would go stale, so after
 * any rendered frame in which the camera changed, replay the last pointer event
 * (`events.update()`). Guarded by "pointer inside the canvas": `update()` replays the last
 * event R3F saw, so after the pointer left it would resurrect a hover (probe B).
 * Costs nothing at idle: demand frameloop renders no frames, so this never runs.
 */
export function useHoverRefresh(options: { periodicMs?: number } = {}): void {
  // Test mode: parts move under a still cursor too, so also refresh every `periodicMs`.
  const { periodicMs } = options
  const lastPeriodic = useRef(0)
  // EventManager<any>: narrow before use.
  const connected: unknown = useThree((s) => s.events).connected
  const inside = useRef(false)
  const lastView = useRef(new Matrix4())
  const lastProjection = useRef(new Matrix4())

  useEffect(() => {
    if (!(connected instanceof HTMLElement)) return
    const enter = () => {
      inside.current = true
    }
    const leave = () => {
      inside.current = false
    }
    connected.addEventListener("pointermove", enter, { passive: true })
    connected.addEventListener("pointerleave", leave)
    return () => {
      connected.removeEventListener("pointermove", enter)
      connected.removeEventListener("pointerleave", leave)
    }
  }, [connected])

  useFrame(({ camera, events, clock }) => {
    camera.updateMatrixWorld() // controls moved it this frame; render() would do this later
    const viewChanged = !lastView.current.equals(camera.matrixWorld)
    const projectionChanged = !lastProjection.current.equals(camera.projectionMatrix)
    const now = clock.elapsedTime * 1000
    const periodic = periodicMs !== undefined && now - lastPeriodic.current >= periodicMs
    if (!viewChanged && !projectionChanged && !periodic) return
    lastPeriodic.current = now
    lastView.current.copy(camera.matrixWorld)
    lastProjection.current.copy(camera.projectionMatrix)
    if (inside.current) events.update?.()
  })
}
