/**
 * The one tuning point for viewport lighting. Tuned on software rendering; reviewed on
 * real GPUs in the Phase 3 gate (3.14).
 */
export const STUDIO_LIGHTING = {
  /** RoomEnvironment PMREM: size 128 looks like 256 for matte/rough parts at a quarter the cost. */
  environment: { intensity: 0.8, pmremSize: 128, sigma: 0.04 },
  hemisphere: 0.5,
  /** Camera-space directions: the rig follows the camera like CAD viewers do. */
  key: { intensity: 1.2, cameraDir: [-0.5, 0.8, 1] },
  fill: { intensity: 0.4, cameraDir: [0.8, -0.2, 0.6] },
} as const
