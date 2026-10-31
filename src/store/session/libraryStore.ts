import { create } from "zustand"
import type { InstalledRecord, LibrarySource } from "@/core/library/items"
import type { PackComponentCheck } from "@/core/library/packCheck"
import type { UserComponentForm } from "@/core/library/userComponent/build"
import type { PartId } from "@/core/schema"

// The Library tab (PLAN 9.4): session state (CLAUDE.md §4, kind 2). The installed list is a
// copy of what Rust reports; the library itself lives in appLocalDataDir.

export type LibraryFilter = LibrarySource | "all"

export type InstallStatus =
  | { phase: "idle" }
  | {
      phase: "confirm" | "installing"
      token: string
      checks: PackComponentCheck[]
      installable: boolean
      files: number
      bytes: number
      verified: boolean
    }

/** What Save as component will take, for the dialog to say. */
export interface SaveSummary {
  parts: number
  anchors: number
  mates: number
  externalMates: number
  suppressedMates: number
  connectors: number
  /** Library components (or models) whose licences it inherits. */
  inherited: string[]
}

export type SaveStatus =
  | { phase: "idle" }
  | {
      phase: "edit" | "saving"
      partIds: PartId[]
      defaults: UserComponentForm
      summary: SaveSummary
      /** The user's publisher namespace: the component id is `<namespace>/<slug>`. */
      namespace: string
      error: string | null
    }

export interface LibraryState {
  installed: InstalledRecord[]
  /** The installed list was read at least once (or failed: `error`). */
  loaded: boolean
  error: string | null
  query: string
  filter: LibraryFilter
  /** The card the list's active descendant is (keyboard and the details strip). */
  activeKey: string | null
  install: InstallStatus
  save: SaveStatus
  setInstalled: (installed: InstalledRecord[]) => void
  setError: (error: string) => void
  setQuery: (query: string) => void
  setFilter: (filter: LibraryFilter) => void
  setActive: (key: string | null) => void
  setInstall: (install: InstallStatus) => void
  setSave: (save: SaveStatus) => void
}

export function createLibraryStore() {
  return create<LibraryState>()((set) => ({
    installed: [],
    loaded: false,
    error: null,
    query: "",
    filter: "all",
    activeKey: null,
    install: { phase: "idle" },
    save: { phase: "idle" },
    setInstalled: (installed) => set({ installed, loaded: true, error: null }),
    setError: (error) => set({ error, loaded: true }),
    setQuery: (query) => set({ query }),
    setFilter: (filter) => set({ filter }),
    setActive: (activeKey) => set({ activeKey }),
    setInstall: (install) => set({ install }),
    setSave: (save) => set({ save }),
  }))
}

export type LibraryStore = ReturnType<typeof createLibraryStore>
export const useLibraryStore = createLibraryStore()
