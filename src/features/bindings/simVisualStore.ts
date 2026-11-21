import { create } from "zustand"
import { NO_VISUALS, type SimVisuals } from "@/core/bindings/visuals"

// What the 3D view shows of the last solve (PLAN 13.1 sinks): session state, set once per
// solve; parts and anchors subscribe to their own entry only.

export const useSimVisualStore = create<SimVisuals & { set: (v: SimVisuals) => void }>()((set) => ({
  ...NO_VISUALS,
  set: (v) => set(v),
}))
