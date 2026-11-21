import { create } from "zustand"
import type { BindingId, BindingSource, BindingTarget } from "@/core/schema"

// The binding editor (PLAN 13.3): open with what its entry point already knows (a mate, a
// part, a block), or on an existing binding to change how it maps.

export interface BindingEditorState {
  open: { from?: BindingSource; to?: BindingTarget; editing?: BindingId } | null
  show: (preset: NonNullable<BindingEditorState["open"]>) => void
  close: () => void
}

export const useBindingEditor = create<BindingEditorState>()((set) => ({
  open: null,
  show: (open) => set({ open }),
  close: () => set({ open: null }),
}))
