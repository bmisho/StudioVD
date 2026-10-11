// Dev-only test hook shared by the app and tests/e2e (no imports, so both tsconfigs can use it).

export interface PixelSummary {
  width: number
  height: number
  /** RGBA of the top-left pixel. */
  topLeft: [number, number, number, number]
  /** Distinct colours after 5-bit quantisation. */
  distinctColours: number
  /** Fraction of pixels that differ from the background gradient by more than the tolerance. */
  nonBackgroundFraction: number
}

export interface ViewportCameraState {
  type: "PerspectiveCamera" | "OrthographicCamera"
  position: [number, number, number]
  target: [number, number, number]
  distance: number
  zoom: number
  /** Visible height at the target plane, mm. */
  visibleHeight: number
}

export interface ViewportProbeApi {
  framesRendered(): number
  /** Renders a frame and summarises its pixels in the same task; null while the context is lost. */
  sample(): (PixelSummary & { webgl2: boolean }) | null
  camera(): ViewportCameraState
  environmentReady(): boolean
  loseContext(): void
  restoreContext(): void
}

declare global {
  interface Window {
    __STUDIOVD_VIEWPORT__?: ViewportProbeApi
  }
}
