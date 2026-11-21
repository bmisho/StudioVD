import { dot, length, scale, sub } from "@/core/math/vec3"
import type { Vec3 } from "@/core/schema"
import { mmToM } from "@/core/units"

// Light between parts (PLAN §2, 13.1): an emitter anchor (its z the optical axis) and a sensor
// anchor (its z the sensor's normal). E = I(α)·cos θ / d², with I(α) = I inside the beam's
// half-angle and 0 outside; the caller zeroes it when a part is in the way.

export interface Ray {
  originMm: Vec3
  /** Unit. */
  z: Vec3
}

/**
 * Illuminance per candela at the sensor, 1/m² (so E = I·factor, lx). Zero outside the beam,
 * behind the sensor, or at no distance.
 */
export function lightFactor(emitter: Ray, sensor: Ray, halfAngle: number): number {
  const d = sub(sensor.originMm, emitter.originMm)
  const dist = length(d)
  if (dist < 1e-9) return 0
  const dir = scale(d, 1 / dist)
  const cosAlpha = dot(emitter.z, dir)
  if (cosAlpha < Math.cos(halfAngle) - 1e-12) return 0
  const cosTheta = -dot(sensor.z, dir)
  if (cosTheta <= 0) return 0
  const m = mmToM(dist)
  return cosTheta / (m * m)
}
