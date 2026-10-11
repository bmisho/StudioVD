import type { World } from "@dimforge/rapier3d-compat"

/**
 * Rapier settings for a millimetre world (PLAN 3.7), shared by the app's <Physics> and the
 * headless tests. Values come from parameter sweeps on the test rig (rapier3d-compat 0.19.2):
 *
 * - LENGTH_UNIT 10: Rapier's tolerances are "normalized × lengthUnit". 10 gives an allowed
 *   penetration of 0.001 × 10 = 0.01 mm (1 would be 0.001 mm; 1000, the literal mm scale,
 *   would allow 1 mm).
 * - PREDICTION_DISTANCE 0.5 -> 5 mm of predictive contacts. With the default (0.002 × 10 =
 *   0.02 mm) a part moving a few mm per step is first seen deep inside the other part and
 *   overshot a hinge stop by 10-19°; with 5 mm it stops at the face.
 * - TIME_STEP 1/120 s (2 steps per 60 Hz frame) and CONTACT_NATURAL_FREQUENCY 120 Hz: stiff
 *   contacts under a sustained push (overshoot 0.016° vs 0.2-1.3° at 1/60 s, 30 Hz).
 * - Gravity is always zero (CLAUDE.md §5): gravity exists only in the schematic solver.
 */
export const TIME_STEP_S = 1 / 120
export const LENGTH_UNIT = 10
export const PREDICTION_DISTANCE = 0.5
export const CONTACT_NATURAL_FREQUENCY = 120
export const SOLVER_ITERATIONS = 4

/** The same settings for a world created outside <Physics> (headless tests). */
export function configureWorld(world: World): void {
  world.gravity = { x: 0, y: 0, z: 0 }
  world.timestep = TIME_STEP_S
  world.lengthUnit = LENGTH_UNIT
  const p = world.integrationParameters
  p.normalizedPredictionDistance = PREDICTION_DISTANCE
  p.contact_natural_frequency = CONTACT_NATURAL_FREQUENCY
  p.numSolverIterations = SOLVER_ITERATIONS
}
