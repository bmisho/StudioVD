import { NeutralToneMapping } from "three"

/**
 * WebGLRenderer options for the viewport Canvas. A module constant so its identity is stable.
 * three r186 is WebGL2-only. Do not pass a `gl` factory: R3F then ignores toneMapping and
 * applies ACES.
 */
export const GL_PARAMS = {
  antialias: true,
  powerPreference: "high-performance",
  // Pixel readers (thumbnails, E2E probe) render and read in the same task instead.
  preserveDrawingBuffer: false,
  // CI and GPU-less Linux machines render with SwiftShader / llvmpipe.
  failIfMajorPerformanceCaveat: false,
  // Khronos PBR Neutral keeps base colours (ACES washes out the blue).
  toneMapping: NeutralToneMapping,
  // The selection outline masks the part's own silhouette (highlight/PartHighlight.tsx), so it
  // works for parts that write no depth (transparent, X-ray, wireframe). Only settable here.
  stencil: true,
} as const

/**
 * Glass (transmission) re-renders the opaque scene into a target first: at half size it costs
 * about a quarter of the memory (about 54 MB instead of 216 MB for a 1280x720 pane at DPR 2).
 */
export const TRANSMISSION_RESOLUTION_SCALE = 0.5

export const DPR: [number, number] = [1, 2]

/** Render on demand while designing; continuously while test mode simulates. */
export const frameloopFor = (testMode: boolean): "always" | "demand" =>
  testMode ? "always" : "demand"
