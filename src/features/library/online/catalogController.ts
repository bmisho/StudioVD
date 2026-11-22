import { APP_VERSION } from "@/core/app-info"
import { readCatalogIndex } from "@/core/library/catalog/readIndex"
import { oldVersions, type PackRow } from "@/core/library/catalog/packs"
import { checkStagedPack } from "@/core/library/packCheck"
import type { Notifier } from "@/lib/notify"
import type * as Catalog from "@/lib/tauri/catalog"
import type { LibraryEntry, StagedPack } from "@/lib/tauri/library"
import type { NetworkView, saveNetworkSettings } from "@/lib/tauri/network"
import type { Result } from "@/lib/tauri/result"
import type { CatalogStore, PendingAction } from "@/store/session/catalogStore"
import type { LibraryStore } from "@/store/session/libraryStore"

export interface CatalogBackend {
  catalogStatus: typeof Catalog.catalogStatus
  refreshCatalog: typeof Catalog.refreshCatalog
  downloadPack: typeof Catalog.downloadPack
  cancelDownload: typeof Catalog.cancelDownload
  libraryDiskUsage: typeof Catalog.libraryDiskUsage
  networkSettings: () => Promise<Result<NetworkView>>
  saveNetworkSettings: typeof saveNetworkSettings
  commitInstall: (token: string) => Promise<Result<LibraryEntry[]>>
  removeComponent: (id: string, version: string) => Promise<Result<LibraryEntry[]>>
}

const WEEK_S = 7 * 24 * 3600
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`

/**
 * The online catalog (PLAN 14.5): status from Rust's verified cache (no network); Refresh and
 * Download only on the user's action, after the one-time consent, never offline. A download
 * is validated like Install from file and committed when every manifest is acceptable.
 */
export function createCatalogController(deps: {
  backend: CatalogBackend
  catalog: CatalogStore
  library: LibraryStore
  notify: Notifier
  now?: () => number
  /** The connection test, when consent was asked for it. */
  runTest?: () => Promise<void>
}) {
  const { backend, catalog, library, notify } = deps
  const now = deps.now ?? (() => Date.now() / 1000)
  const state = () => catalog.getState()

  const apply = (status: Catalog.CatalogStatus) => {
    const read = status.index === null ? null : readCatalogIndex(status.index)
    state().setStatus(status, read?.ok ? read.index : null, read && !read.ok ? read.message : null)
  }
  /** Whether network use may start now; asks for consent (and remembers the action) if not. */
  const mayGo = (action: PendingAction): boolean => {
    const s = state().status
    if (!s) return false
    if (s.offline) {
      notify.error("Offline mode is on", "Turn it off in Settings › Network to go online.")
      return false
    }
    if (!s.consented) {
      state().setConsent(action)
      return false
    }
    return true
  }

  const installStaged = async (pack: StagedPack, label: string) => {
    const { checks, installable } = checkStagedPack(pack.components, APP_VERSION)
    if (!installable) {
      library.getState().setInstall({
        phase: "confirm",
        token: pack.token,
        checks,
        installable,
        files: pack.files,
        bytes: pack.bytes,
        verified: pack.verified,
      })
      return
    }
    const done = await backend.commitInstall(pack.token)
    if (!done.ok) return notify.error(`${label} was not installed`, done.error.message)
    library.getState().setInstalled(done.value)
    notify.success(`Installed ${plural(checks.length, "component")} from ${label}`)
  }

  const controller = {
    async load(): Promise<void> {
      const got = await backend.catalogStatus()
      if (got.ok) apply(got.value)
    },
    async refresh(): Promise<void> {
      if (!state().status) await controller.load()
      const s = state().status
      if (!s) return
      if (!s.configured)
        return notify.info(
          "No online catalog",
          "This build has no catalog to download from. Install from file still works."
        )
      if (state().refreshing || !mayGo({ kind: "refresh" })) return
      state().setRefreshing(true)
      const got = await backend.refreshCatalog()
      state().setRefreshing(false)
      if (!got.ok) return notify.error("The catalog could not be refreshed", got.error.message)
      apply(got.value.status)
      notify.success(got.value.changed ? "The catalog was updated" : "The catalog is up to date")
      if (got.value.previewsFailed > 0)
        notify.warning(
          "Some thumbnails are missing",
          `${plural(got.value.previewsFailed, "preview pack")} could not be downloaded.`
        )
    },
    async download(pack: string, label: string): Promise<void> {
      if (Object.hasOwn(state().downloads, pack) || !mayGo({ kind: "download", pack })) return
      state().setDownload(pack, { done: 0, total: 0 })
      const got = await backend.downloadPack(pack, (p) => state().setDownload(pack, p))
      state().setDownload(pack, null)
      if (!got.ok) {
        if (got.error.kind === "cancelled") return notify.info("Download cancelled", label)
        return notify.error(`${label} could not be downloaded`, got.error.message)
      }
      await controller.load() // an expired index may have been refreshed first
      await installStaged(got.value, label)
    },
    async cancel(pack: string): Promise<void> {
      await backend.cancelDownload(pack)
    },
    /** The consent dialog's answer: saved once, then the action it held runs. */
    async answerConsent(allow: boolean): Promise<void> {
      const pending = state().consent
      state().setConsent(null)
      if (!allow || !pending) return
      const view = await backend.networkSettings()
      if (!view.ok)
        return notify.error("The network settings could not be read", view.error.message)
      const saved = await backend.saveNetworkSettings({ ...view.value.settings, consented: true })
      if (!saved.ok)
        return notify.error("The network settings could not be saved", saved.error.message)
      state().setNetwork(saved.value)
      await controller.load()
      if (pending.kind === "refresh") await controller.refresh()
      else if (pending.kind === "download") await controller.download(pending.pack, "The pack")
      else await deps.runTest?.()
    },
    async removePack(row: PackRow): Promise<void> {
      const installed = library.getState().installed
      for (const c of row.components) {
        if (!installed.some((r) => r.id === c.id && r.version === c.version)) continue
        const done = await backend.removeComponent(c.id, c.version)
        if (!done.ok) return notify.error(`${row.label} could not be removed`, done.error.message)
        library.getState().setInstalled(done.value)
      }
      notify.success(`Removed ${row.label}`)
      await controller.loadUsage()
    },
    async removeOldVersions(): Promise<void> {
      const old = oldVersions(library.getState().installed)
      for (const r of old) {
        const done = await backend.removeComponent(r.id, r.version)
        if (!done.ok) return notify.error("Old versions could not be removed", done.error.message)
        library.getState().setInstalled(done.value)
      }
      notify.success(`Removed ${plural(old.length, "old version")}`)
      await controller.loadUsage()
    },
    async loadUsage(): Promise<void> {
      const got = await backend.libraryDiskUsage()
      if (got.ok) state().setUsage(got.value)
    },
    /** On start, only when the user opted in: at most once a week, silently. */
    async weeklyCheck(): Promise<void> {
      const view = await backend.networkSettings()
      if (!view.ok) return
      const s = view.value.settings
      if (!s.weeklyCheck || !s.consented || s.offline) return
      if (s.lastCheck !== null && now() - s.lastCheck < WEEK_S) return
      await controller.load()
      if (!state().status?.configured) return
      const got = await backend.refreshCatalog()
      if (got.ok) apply(got.value.status)
    },
  }
  return controller
}

export type CatalogController = ReturnType<typeof createCatalogController>
