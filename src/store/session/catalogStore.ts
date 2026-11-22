import { create } from "zustand"
import type { CatalogIndex } from "@/core/schema"
import type { CatalogStatus, DiskUsage, DownloadProgress } from "@/lib/tauri/catalog"
import type { HostCheck, NetworkView } from "@/lib/tauri/network"

// The online catalog and Settings › Network (PLAN 14.4, 14.5): session state (CLAUDE.md §4,
// kind 2). The index is Rust's verified cache, validated here; nothing is persisted here.

/** What waits for the consent dialog: the action the user asked for. */
export type PendingAction =
  { kind: "refresh" } | { kind: "download"; pack: string } | { kind: "test" }

export interface CatalogState {
  status: CatalogStatus | null
  index: CatalogIndex | null
  indexError: string | null
  refreshing: boolean
  /** Downloads in progress, by pack SHA-256. */
  downloads: Record<string, DownloadProgress>
  usage: DiskUsage | null
  consent: PendingAction | null
  network: NetworkView | null
  networkOpen: boolean
  checks: HostCheck[] | null
  testing: boolean
  packsOpen: boolean
  setStatus: (status: CatalogStatus, index: CatalogIndex | null, indexError: string | null) => void
  setRefreshing: (refreshing: boolean) => void
  setDownload: (pack: string, progress: DownloadProgress | null) => void
  setUsage: (usage: DiskUsage) => void
  setConsent: (consent: PendingAction | null) => void
  setNetwork: (network: NetworkView) => void
  setNetworkOpen: (open: boolean) => void
  setChecks: (checks: HostCheck[] | null, testing: boolean) => void
  setPacksOpen: (open: boolean) => void
}

export function createCatalogStore() {
  return create<CatalogState>()((set) => ({
    status: null,
    index: null,
    indexError: null,
    refreshing: false,
    downloads: {},
    usage: null,
    consent: null,
    network: null,
    networkOpen: false,
    checks: null,
    testing: false,
    packsOpen: false,
    setStatus: (status, index, indexError) => set({ status, index, indexError }),
    setRefreshing: (refreshing) => set({ refreshing }),
    setDownload: (pack, progress) =>
      set((s) => {
        const downloads = { ...s.downloads }
        if (progress) downloads[pack] = progress
        else delete downloads[pack]
        return { downloads }
      }),
    setUsage: (usage) => set({ usage }),
    setConsent: (consent) => set({ consent }),
    setNetwork: (network) => set({ network }),
    setNetworkOpen: (networkOpen) => set({ networkOpen, ...(networkOpen && { checks: null }) }),
    setChecks: (checks, testing) => set({ checks, testing }),
    setPacksOpen: (packsOpen) => set({ packsOpen }),
  }))
}

export type CatalogStore = ReturnType<typeof createCatalogStore>
export const useCatalogStore = createCatalogStore()
