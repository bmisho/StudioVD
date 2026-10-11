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
} as const

export const DPR: [number, number] = [1, 2]

/** Render on demand while designing; continuously while test mode simulates. */
export const frameloopFor = (testMode: boolean): "always" | "demand" =>
  testMode ? "always" : "demand"
