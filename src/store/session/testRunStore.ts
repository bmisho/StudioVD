import { create } from "zustand"
import type { PartId } from "@/core/schema"

// What the current test run found when it started (PLAN 10.3): session state, set once per
// run (never per frame: live poses and joint readings are transient, `jointReadings.ts`).

export interface InterferenceRow {
  a: PartId
  b: PartId
  depthMm: number
}

export interface TestRunState {
  /** Parts overlapping at the start of the run; their contacts are off for it. */
  interferences: InterferenceRow[]
  /** The user closed the list for this run. */
  dismissed: boolean
  setInterferences: (rows: InterferenceRow[]) => void
  dismiss: () => void
}

export const useTestRunStore = create<TestRunState>()((set) => ({
  interferences: [],
  dismissed: false,
  setInterferences: (interferences) => set({ interferences, dismissed: false }),
  dismiss: () => set({ dismissed: true }),
}))
