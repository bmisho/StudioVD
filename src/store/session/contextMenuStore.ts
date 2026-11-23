import { create } from "zustand"

// Context menus (PLAN 15.4): session state, one open at a time, at the pointer.

/** Where the menu was asked for; decides its commands. */
export type ContextMenuPlace = "viewport" | "tree" | "schematic"

export interface ContextMenuRequest {
  place: ContextMenuPlace
  x: number
  y: number
}

export interface ContextMenuState {
  open: ContextMenuRequest | null
  show: (request: ContextMenuRequest) => void
  hide: () => void
}

export const useContextMenuStore = create<ContextMenuState>()((set) => ({
  open: null,
  show: (open) => set({ open }),
  hide: () => set({ open: null }),
}))
