import type { Notifier } from "@/lib/notify"
import type * as Network from "@/lib/tauri/network"
import type { NetworkSettings } from "@/lib/tauri/network"
import type { CatalogStore } from "@/store/session/catalogStore"

export interface NetworkBackend {
  networkSettings: typeof Network.networkSettings
  saveNetworkSettings: typeof Network.saveNetworkSettings
  pickExtraCa: typeof Network.pickExtraCa
  clearExtraCa: typeof Network.clearExtraCa
  testConnection: typeof Network.testConnection
}

/**
 * Settings › Network (PLAN 14.4): Rust keeps and checks the settings; this reads and saves
 * them and runs the connection test (which, like any network use, needs consent first).
 */
export function createNetworkController(deps: {
  backend: NetworkBackend
  catalog: CatalogStore
  notify: Notifier
  /** Refreshes the catalog status after a change (offline, consent, mirror). */
  reload: () => Promise<void>
}) {
  const { backend, catalog, notify } = deps
  const state = () => catalog.getState()
  const show = (got: Awaited<ReturnType<NetworkBackend["networkSettings"]>>, what: string) => {
    if (!got.ok) {
      notify.error(`${what} failed`, got.error.message)
      return false
    }
    state().setNetwork(got.value)
    return true
  }
  return {
    async open(): Promise<void> {
      if (show(await backend.networkSettings(), "Reading the network settings"))
        state().setNetworkOpen(true)
    },
    close(): void {
      state().setNetworkOpen(false)
    },
    /** Saves a change; false (with a message) when Rust refuses it. */
    async save(settings: NetworkSettings): Promise<boolean> {
      const ok = show(await backend.saveNetworkSettings(settings), "Saving the network settings")
      if (ok) await deps.reload()
      return ok
    },
    async pickCa(): Promise<void> {
      const got = await backend.pickExtraCa()
      if (!got.ok) return notify.error("The certificate was not added", got.error.message)
      if (got.value) state().setNetwork(got.value)
    },
    async clearCa(): Promise<void> {
      show(await backend.clearExtraCa(), "Removing the certificate")
    },
    async test(): Promise<void> {
      const view = state().network
      if (!view) return
      if (view.settings.offline)
        return notify.error("Offline mode is on", "Turn it off to test the connection.")
      if (!view.settings.consented) return state().setConsent({ kind: "test" })
      state().setChecks(null, true)
      const got = await backend.testConnection()
      if (!got.ok) {
        state().setChecks([{ host: "—", ok: false, message: got.error.message }], false)
        return
      }
      state().setChecks(got.value, false)
    },
  }
}

export type NetworkController = ReturnType<typeof createNetworkController>
