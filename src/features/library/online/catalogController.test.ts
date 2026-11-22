import { describe, expect, it, vi } from "vitest"
import { libraryFixture, libraryFixtureBytes } from "@/core/schema/testing/libraryFixtures"
import type { Notifier } from "@/lib/notify"
import type { CatalogStatus } from "@/lib/tauri/catalog"
import type { LibraryEntry, StagedPack } from "@/lib/tauri/library"
import type { NetworkSettings, NetworkView } from "@/lib/tauri/network"
import { err, ok } from "@/lib/tauri/result"
import { createCatalogStore } from "@/store/session/catalogStore"
import { createLibraryStore } from "@/store/session/libraryStore"
import { createCatalogController, type CatalogBackend } from "./catalogController"

const index = JSON.stringify(libraryFixture("catalog.valid.json"))
const manifest = new TextDecoder().decode(libraryFixtureBytes("component-asset.valid.json"))
const KNOB = { id: "acme/knob-15mm", version: "2.1.0-beta.1" }
const PACK = "f".repeat(64)
const status = (over: Partial<CatalogStatus> = {}): CatalogStatus => ({
  configured: true,
  hosts: ["catalog.example"],
  offline: false,
  consented: true,
  index,
  fetchedAt: 1,
  expired: false,
  ...over,
})
const settings: NetworkSettings = {
  offline: false,
  consented: false,
  proxy: { mode: "system" },
  mirror: null,
  weeklyCheck: false,
  lastCheck: null,
  extraCa: null,
}
const view = (s: NetworkSettings): NetworkView => ({
  settings: s,
  hosts: [],
  systemProxy: "",
  proxyInUse: "",
})
const staged: StagedPack = {
  token: "t1",
  components: [{ ...KNOB, manifestSha256: "0".repeat(64), manifest }],
  files: 3,
  bytes: 1000,
  verified: true,
}
const entry: LibraryEntry = {
  ...KNOB,
  manifestSha256: "0".repeat(64),
  origin: "official",
  verified: true,
  manifest,
}

function setup(over: Partial<CatalogBackend> = {}, first = status()) {
  const notify: Notifier = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() }
  let current = first
  const backend: CatalogBackend = {
    catalogStatus: vi.fn(() => Promise.resolve(ok(current))),
    refreshCatalog: vi.fn(() =>
      Promise.resolve(ok({ status: current, changed: true, previewsFailed: 0 }))
    ),
    downloadPack: vi.fn(
      (_pack: string, onProgress: (p: { done: number; total: number }) => void) => {
        onProgress({ done: 500, total: 1000 })
        return Promise.resolve(ok(staged))
      }
    ),
    cancelDownload: vi.fn(() => Promise.resolve(ok(true))),
    libraryDiskUsage: vi.fn(() => Promise.resolve(ok({ store: 1, catalogs: 2, downloads: 0 }))),
    networkSettings: vi.fn(() => Promise.resolve(ok(view(settings)))),
    saveNetworkSettings: vi.fn((s: NetworkSettings) => {
      current = { ...current, consented: s.consented }
      return Promise.resolve(ok(view(s)))
    }),
    commitInstall: vi.fn(() => Promise.resolve(ok([entry]))),
    removeComponent: vi.fn(() => Promise.resolve(ok([] as LibraryEntry[]))),
    ...over,
  }
  const catalog = createCatalogStore()
  const library = createLibraryStore()
  const controller = createCatalogController({ backend, catalog, library, notify, now: () => 1e9 })
  return { backend, catalog, library, notify, controller }
}

describe("catalog controller (PLAN 14.5)", () => {
  it("reads the verified cache without going online, and validates it", async () => {
    const { backend, catalog, controller } = setup()
    await controller.load()
    expect(catalog.getState().index?.sequence).toBe(42)
    expect(backend.refreshCatalog).not.toHaveBeenCalled()
    const broken = setup({}, status({ index: "{" }))
    await broken.controller.load()
    expect(broken.catalog.getState().index).toBeNull()
    expect(broken.catalog.getState().indexError).toContain("not JSON")
  })

  it("asks for consent once, then runs what was asked", async () => {
    const { backend, catalog, controller } = setup({}, status({ consented: false }))
    await controller.refresh()
    expect(backend.refreshCatalog).not.toHaveBeenCalled()
    expect(catalog.getState().consent).toEqual({ kind: "refresh" })
    await controller.answerConsent(true)
    expect(backend.saveNetworkSettings).toHaveBeenCalledWith(
      expect.objectContaining({ consented: true })
    )
    expect(backend.refreshCatalog).toHaveBeenCalledTimes(1)
    expect(catalog.getState().consent).toBeNull()
  })

  it("never goes online offline or without a configured catalog", async () => {
    const offline = setup({}, status({ offline: true }))
    await offline.controller.refresh()
    await offline.controller.download(PACK, "Knobs")
    expect(offline.backend.refreshCatalog).not.toHaveBeenCalled()
    expect(offline.backend.downloadPack).not.toHaveBeenCalled()
    const none = setup({}, status({ configured: false }))
    await none.controller.refresh()
    expect(none.backend.refreshCatalog).not.toHaveBeenCalled()
    expect(none.notify.info).toHaveBeenCalled()
  })

  it("downloads with progress, validates and installs; reports cancellation", async () => {
    const { backend, catalog, library, controller } = setup()
    await controller.load()
    const seen: unknown[] = []
    catalog.subscribe((s) => seen.push(s.downloads[PACK]))
    await controller.download(PACK, "Knobs")
    expect(seen).toContainEqual({ done: 500, total: 1000 })
    expect(catalog.getState().downloads).toEqual({})
    expect(backend.commitInstall).toHaveBeenCalledWith("t1")
    expect(library.getState().installed).toEqual([entry])

    const cancelled = setup({
      downloadPack: vi.fn(() => Promise.resolve(err({ kind: "cancelled", message: "x" }))),
    })
    await cancelled.controller.load()
    await cancelled.controller.download(PACK, "Knobs")
    expect(cancelled.notify.info).toHaveBeenCalledWith("Download cancelled", "Knobs")
    expect(cancelled.backend.commitInstall).not.toHaveBeenCalled()
  })

  it("shows an invalid download for confirmation instead of committing it", async () => {
    const bad = { ...staged, components: [{ ...staged.components[0], manifest: "{}" }] }
    const { backend, library, controller } = setup({
      downloadPack: vi.fn(() => Promise.resolve(ok(bad as StagedPack))),
    })
    await controller.load()
    await controller.download(PACK, "Knobs")
    expect(backend.commitInstall).not.toHaveBeenCalled()
    expect(library.getState().install).toMatchObject({ phase: "confirm", installable: false })
  })

  it("checks weekly only when opted in, and only after a week", async () => {
    const off = setup()
    await off.controller.weeklyCheck()
    expect(off.backend.refreshCatalog).not.toHaveBeenCalled()
    const on = { ...settings, consented: true, weeklyCheck: true }
    const recent = setup({
      networkSettings: vi.fn(() => Promise.resolve(ok(view({ ...on, lastCheck: 1e9 - 3600 })))),
    })
    await recent.controller.weeklyCheck()
    expect(recent.backend.refreshCatalog).not.toHaveBeenCalled()
    const due = setup({
      networkSettings: vi.fn(() => Promise.resolve(ok(view({ ...on, lastCheck: 1 })))),
    })
    await due.controller.weeklyCheck()
    expect(due.backend.refreshCatalog).toHaveBeenCalledTimes(1)
  })
})
