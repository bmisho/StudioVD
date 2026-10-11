import { useFrame, useThree } from "@react-three/fiber"
import { useEffect, useRef } from "react"
import { Matrix4 } from "three"
import { periodicRefreshDue } from "@/core/scene/pickPolicy"

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
  // Entering or leaving test mode moves parts (leaving restores the design pose) without a
  // camera change: refresh once on the next frame.
  const forced = useRef(false)
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    forced.current = true
    invalidate()
  }, [periodicMs, invalidate])

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

  useFrame(({ camera, events, scene }) => {
    camera.updateMatrixWorld() // controls moved it this frame; render() would do this later
    const viewChanged = !lastView.current.equals(camera.matrixWorld)
    const projectionChanged = !lastProjection.current.equals(camera.projectionMatrix)
    // Wall clock, not R3F's: that one restarts at 0 whenever the frameloop changes.
    const now = performance.now()
    const periodic = periodicRefreshDue(now, lastPeriodic.current, periodicMs)
    if (!viewChanged && !projectionChanged && !periodic && !forced.current) return
    forced.current = false
    lastPeriodic.current = now
    lastView.current.copy(camera.matrixWorld)
    lastProjection.current.copy(camera.projectionMatrix)
    if (!inside.current) return
    scene.updateMatrixWorld() // parts moved since the last render (physics, pose restore)
    events.update?.()
  })
}
