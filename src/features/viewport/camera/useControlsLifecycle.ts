import { useEffect } from "react"
import { useThree } from "@react-three/fiber"
import type { CameraRig } from "./createCameraRig"

const REDRAW_EVENTS = ["controlstart", "control", "transitionstart", "update", "wake"] as const

/** The element R3F listens on, so camera-controls and picking see the same events. */
export function eventElement(connected: unknown, fallback: HTMLElement): HTMLElement {
  return connected instanceof HTMLElement ? connected : fallback
}

/**
 * Connects the long-lived controls to the canvas and redraws on their events, so orbiting
 * works with frameloop="demand". StrictMode runs this twice; connect/disconnect stay paired.
 */
export function useControlsLifecycle(rig: CameraRig): void {
  const connected = useThree((s): unknown => s.events.connected)
  const gl = useThree((s) => s.gl)
  const invalidate = useThree((s) => s.invalidate)

  useEffect(() => {
    const controls = rig.controls
    controls.connect(eventElement(connected, gl.domElement))
    const redraw = () => invalidate()
    for (const name of REDRAW_EVENTS) controls.addEventListener(name, redraw)
    return () => {
      for (const name of REDRAW_EVENTS) controls.removeEventListener(name, redraw)
      controls.disconnect()
    }
  }, [rig, connected, gl, invalidate])
}
