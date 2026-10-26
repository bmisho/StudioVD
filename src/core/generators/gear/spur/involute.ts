import { degToRad } from "@/core/units"
import type { Vec2 } from "../../mesh/outline"

/** Involute function inv φ = tan φ − φ. */
export const inv = (phi: number): number => Math.tan(phi) - phi

export interface SpurGeometry {
  /** Pitch, base, tip and root radii (mm). */
  r: number
  rb: number
  ra: number
  rf: number
  /** Profile shift coefficient used. */
  x: number
  /** Whether the tip was shortened to keep a land of at least 0.25 m. */
  tipShortened: boolean
  /** The outline, counter-clockwise (one tooth centred on +u). */
  outline: Vec2[]
}

/** Profile shift that avoids undercut for z < 17 at 20° (x = (17 − z) / 17), else 0. */
export const autoShift = (z: number): number => Math.max(0, (17 - z) / 17)

/**
 * A standard involute spur gear outline (ISO 53 basic rack: addendum m, dedendum 1.25 m),
 * with profile shift `x`. Half the tooth's angular thickness at radius ρ ≥ rb is
 * ψ(ρ) = ψp + inv α − inv φ(ρ), with ψp = (π/2 + 2x tan α)/z and cos φ(ρ) = rb/ρ. Below the
 * base circle the flank runs radially to the root circle; root fillets are left out.
 */
export function spurOutline(m: number, z: number, alphaDeg: number, x: number): SpurGeometry {
  const alpha = degToRad(alphaDeg)
  const r = (m * z) / 2
  const rb = r * Math.cos(alpha)
  const rf = r - m * (1.25 - x)
  const psiP = (Math.PI / 2 + 2 * x * Math.tan(alpha)) / z
  const psi = (rho: number) => psiP + inv(alpha) - inv(Math.acos(Math.min(1, rb / rho)))
  let ra = r + m * (1 + x)
  const land = 0.25 * m
  let tipShortened = false
  if (2 * ra * psi(ra) < land) {
    let [lo, hi] = [Math.max(rb, r), ra]
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2
      if (2 * mid * psi(mid) < land) hi = mid
      else lo = mid
    }
    ra = lo
    tipShortened = true
  }
  const rho0 = Math.max(rb, rf)
  const roll = (rho: number) => Math.sqrt(Math.max(0, (rho / rb) ** 2 - 1))
  const flankSteps = 8
  const [t0, t1] = [roll(rho0), roll(ra)]
  const flank = Array.from({ length: flankSteps + 1 }, (_, j) => {
    const t = t0 + ((t1 - t0) * j) / flankSteps
    const rho = j === flankSteps ? ra : rb * Math.sqrt(1 + t * t)
    return { rho, psi: psi(Math.max(rho, rb)) }
  })
  const polar = (rho: number, a: number): Vec2 => [rho * Math.cos(a), rho * Math.sin(a)]
  const outline: Vec2[] = []
  const pitch = (2 * Math.PI) / z
  const tipSteps = 3
  const rootSteps = 4
  const psi0 = flank[0]?.psi ?? 0
  const psiA = flank.at(-1)?.psi ?? 0
  for (let k = 0; k < z; k++) {
    const c = k * pitch
    if (rf < rb) outline.push(polar(rf, c - psi0))
    for (const p of flank) outline.push(polar(p.rho, c - p.psi))
    for (let j = 1; j < tipSteps; j++) outline.push(polar(ra, c - psiA + (2 * psiA * j) / tipSteps))
    for (const p of [...flank].reverse()) outline.push(polar(p.rho, c + p.psi))
    if (rf < rb) outline.push(polar(rf, c + psi0))
    const [a0, a1] = [c + psi0, c + pitch - psi0]
    for (let j = 1; j < rootSteps; j++) outline.push(polar(rf, a0 + ((a1 - a0) * j) / rootSteps))
  }
  return { r, rb, ra, rf, x, tipShortened, outline }
}
