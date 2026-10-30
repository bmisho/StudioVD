import { APP_VERSION } from "@/core/app-info"
import { checkStagedPack } from "@/core/library/packCheck"
import type { Notifier } from "@/lib/notify"
import type { LibraryEntry, StagedPack } from "@/lib/tauri/library"
import type { Result } from "@/lib/tauri/result"
import type { LibraryStore } from "@/store/session/libraryStore"

export interface LibraryBackend {
  listLibrary: () => Promise<Result<LibraryEntry[]>>
  pickPack: () => Promise<Result<StagedPack | null>>
  commitInstall: (token: string) => Promise<Result<LibraryEntry[]>>
  cancelInstall: (token: string) => Promise<Result<void>>
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`

/**
 * The installed list and Install from file (PLAN 9.2, 9.4): Rust extracts and checks the
 * pack; here every manifest is validated and the user confirms (an unsigned pack says it is
 * unverified) before Rust commits it.
 */
export function createLibraryController(deps: {
  backend: LibraryBackend
  store: LibraryStore
  notify: Notifier
}) {
  const { backend, store, notify } = deps
  return {
    async refresh(): Promise<void> {
      const listed = await backend.listLibrary()
      if (listed.ok) store.getState().setInstalled(listed.value)
      else store.getState().setError(listed.error.message)
    },
    /** Library › Install from file…: the dialog runs in Rust; the confirmation opens on the result. */
    async installFromFile(): Promise<void> {
      if (store.getState().install.phase !== "idle") return
      const picked = await backend.pickPack()
      if (!picked.ok) return notify.error("The pack cannot be installed", picked.error.message)
      if (!picked.value) return
      const pack = picked.value
      const { checks, installable } = checkStagedPack(pack.components, APP_VERSION)
      store.getState().setInstall({
        phase: "confirm",
        token: pack.token,
        checks,
        installable,
        files: pack.files,
        bytes: pack.bytes,
        verified: pack.verified,
      })
    },
    async confirmInstall(): Promise<void> {
      const install = store.getState().install
      if (install.phase !== "confirm" || !install.installable) return
      store.getState().setInstall({ ...install, phase: "installing" })
      const done = await backend.commitInstall(install.token)
      store.getState().setInstall({ phase: "idle" })
      if (!done.ok) return notify.error("The pack was not installed", done.error.message)
      store.getState().setInstalled(done.value)
      notify.success(`Installed ${plural(install.checks.length, "component")}`)
    },
    async cancelInstall(): Promise<void> {
      const install = store.getState().install
      if (install.phase !== "confirm") return
      store.getState().setInstall({ phase: "idle" })
      await backend.cancelInstall(install.token) // staging is swept at startup anyway
    },
  }
}

export type LibraryController = ReturnType<typeof createLibraryController>
