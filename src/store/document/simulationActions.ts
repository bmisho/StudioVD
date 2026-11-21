import type { Vec3 } from "@/core/schema"
import type { Set } from "./actionTypes"

export interface SimulationActions {
  /** The solver's gravity, m/s² in world axes (PLAN 12.6); not finite or past 1000: ignored. */
  setGravity: (g: Vec3) => void
}

/** Past 100 g nothing on a bench is meant: a typo, not a setting. */
const MAX_G = 1000

export function simulationActions(set: Set): SimulationActions {
  return {
    setGravity: (g) => {
      if (!g.every((v) => Number.isFinite(v) && Math.abs(v) <= MAX_G)) return
      set((s) => {
        const was = s.doc.simulation.gravity
        if (was.every((v, i) => v === g[i])) return
        s.doc.simulation.gravity = [g[0] + 0, g[1] + 0, g[2] + 0]
      })
    },
  }
}
