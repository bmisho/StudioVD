import { describe, expect, it, vi } from "vitest"
import { libraryFixtureBytes } from "@/core/schema/testing/libraryFixtures"
import type { Notifier } from "@/lib/notify"
import type { LibraryEntry, StagedPack } from "@/lib/tauri/library"
import { err, ok } from "@/lib/tauri/result"
import { createLibraryStore } from "@/store/session/libraryStore"
import { createLibraryController, type LibraryBackend } from "./libraryController"

const manifest = new TextDecoder().decode(libraryFixtureBytes("component-asset.valid.json"))
const { id, version } = (JSON.parse(manifest) as { identity: { id: string; version: string } })
  .identity
const entry: LibraryEntry = {
  id,
  version,
  manifestSha256: "0".repeat(64),
  origin: "sideloaded",
  verified: false,
  manifest,
}
const pack: StagedPack = {
  token: "t1",
  components: [{ id, version, manifestSha256: "0".repeat(64), manifest }],
  files: 3,
  bytes: 1000,
  verified: false,
}

function setup(overrides: Partial<LibraryBackend> = {}) {
  const notify: Notifier = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() }
  const backend: LibraryBackend = {
    listLibrary: vi.fn(() => Promise.resolve(ok([] as LibraryEntry[]))),
    pickPack: vi.fn(() => Promise.resolve(ok(pack))),
    commitInstall: vi.fn(() => Promise.resolve(ok([entry]))),
    cancelInstall: vi.fn(() => Promise.resolve(ok(undefined))),
    ...overrides,
  }
  const store = createLibraryStore()
  return { store, backend, notify, controller: createLibraryController({ backend, store, notify }) }
}

describe("library controller (PLAN 9.2, 9.4)", () => {
  it("validates a picked pack, waits for confirmation, then installs it", async () => {
    const { store, backend, notify, controller } = setup()
    await controller.installFromFile()
    const install = store.getState().install
    expect(install).toMatchObject({
      phase: "confirm",
      token: "t1",
      installable: true,
      verified: false,
    })
    expect(backend.commitInstall).not.toHaveBeenCalled()
    await controller.confirmInstall()
    expect(backend.commitInstall).toHaveBeenCalledWith("t1")
    expect(store.getState().install.phase).toBe("idle")
    expect(store.getState().installed).toEqual([entry])
    expect(notify.success).toHaveBeenCalled()
  })

  it("never commits a pack with an invalid component, and cancels it", async () => {
    const bad = {
      ...pack,
      components: [{ ...pack.components[0], manifest: "{}" } as StagedPack["components"][number]],
    }
    const { store, backend, controller } = setup({
      pickPack: vi.fn(() => Promise.resolve(ok(bad))),
    })
    await controller.installFromFile()
    expect(store.getState().install).toMatchObject({ phase: "confirm", installable: false })
    await controller.confirmInstall()
    expect(backend.commitInstall).not.toHaveBeenCalled()
    await controller.cancelInstall()
    expect(backend.cancelInstall).toHaveBeenCalledWith("t1")
    expect(store.getState().install.phase).toBe("idle")
  })

  it("reports a failed pick and a failed listing; a cancelled pick does nothing", async () => {
    const failing = setup({
      pickPack: vi.fn(() => Promise.resolve(err({ kind: "invalidInput", message: "bad zip" }))),
      listLibrary: vi.fn(() => Promise.resolve(err({ kind: "io", message: "disk" }))),
    })
    await failing.controller.installFromFile()
    expect(failing.notify.error).toHaveBeenCalledWith("The pack cannot be installed", "bad zip")
    await failing.controller.refresh()
    expect(failing.store.getState()).toMatchObject({ loaded: true, error: "disk" })
    const cancelled = setup({ pickPack: vi.fn(() => Promise.resolve(ok(null))) })
    await cancelled.controller.installFromFile()
    expect(cancelled.store.getState().install.phase).toBe("idle")
  })
})
