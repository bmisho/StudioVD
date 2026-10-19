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

export interface ClientPoint {
  x: number
  y: number
}

export interface PartPoseState {
  position: [number, number, number]
  quaternion: [number, number, number, number]
}

export interface PartLookState {
  /** One per material slot (one for a single-slot asset or an unloaded box). */
  materials: { type: string; name: string; transparent: boolean; color: string | null }[]
  /** False in wireframe (the faces stay pickable). */
  facesVisible: boolean
  /** Feature edge line segments drawn (0 when shaded, or not computed yet). */
  edgeSegments: number
}

export interface ViewportProbeApi {
  framesRendered(): number
  /** Renders a frame and summarises its pixels in the same task; null while the context is lost. */
  sample(): (PixelSummary & { webgl2: boolean }) | null
  camera(): ViewportCameraState
  environmentReady(): boolean
  loseContext(): void
  restoreContext(): void
  /** Client (page) coordinates of a world point (mm), as the camera sees it now. */
  project(pointMm: [number, number, number]): ClientPoint
  /** Client coordinates of the centre of a part's current bounding box; null if not shown. */
  projectPart(id: string): ClientPoint | null
  /** What a click at client coordinates would pick: the part id, or null. */
  pickAt(x: number, y: number): string | null
  /** The part the viewport pre-highlights (hover), or null. */
  hoveredId(): string | null
  /** Renders a frame and reads the RGB of the pixel under a client point; null if lost. */
  pixelAt(x: number, y: number): [number, number, number] | null
  /** Renders a frame and counts pixels within `tolerance` of the 3D highlight colour. */
  highlightPixels(tolerance?: number): number
  /** Test mode: the physics world is built and a press on a part starts a drag. */
  dragReady(): boolean
  /** Document parts, in insertion order. */
  parts(): { id: string; name: string }[]
  /** A part's live pose (moves in test mode), or null if not shown. */
  partPose(id: string): PartPoseState | null
  /** What a part draws: its triangle count, and whether that is the loaded asset (not its box). */
  partMesh(id: string): { triangles: number; loaded: boolean } | null
  /** A part's materials, face visibility and feature edges; null if not shown. */
  partLook(id: string): PartLookState | null
  /** The transform gizmo handle under the pointer ("X", "XY", …), or null. */
  gizmoAxis(): string | null
}

declare global {
  interface Window {
    __STUDIOVD_VIEWPORT__?: ViewportProbeApi
  }
}
