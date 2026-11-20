import type { CouplingKind } from "@/core/physics/couplingRatio"

/** What each coupling is called and what its ratio counts (PLAN 10.5). */
export const COUPLING_TEXT: Record<CouplingKind, { label: string; unit: string; hint: string }> = {
  gear: { label: "Gear pair", unit: "rad/rad", hint: "Minus: the gears turn opposite ways" },
  rackPinion: { label: "Rack and pinion", unit: "mm/rad", hint: "The pinion's pitch radius" },
  leadScrew: { label: "Lead screw", unit: "mm/rad", hint: "Lead ÷ 2π (T8, lead 8: 1.27)" },
}

/** Ratio input: a usable number within the store's bounds (zero means nothing). */
export const ratioClamp = (typed: number): number | null =>
  Number.isFinite(typed) && typed !== 0 ? Math.max(-1e4, Math.min(1e4, typed)) : null
