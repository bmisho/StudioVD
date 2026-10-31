import { describe, expect, it, vi } from "vitest"
import { assetFromManifest } from "@/core/library/assetRecords"
import { definitionOf } from "@/core/library/definition"
import { instantiateComponent } from "@/core/library/instantiate"
import { at, generated } from "@/core/library/testing/generatedComponent"
import { mergeBatch } from "@/core/scene/entityBatch"
import {
  ComponentManifestSchema,
  createEmptyDocument,
  type ComponentInstanceId,
  type PartId,
} from "@/core/schema"
import { libraryFixtureBytes } from "@/core/schema/testing/libraryFixtures"
import type { Notifier } from "@/lib/notify"
import type { LibraryEntry } from "@/lib/tauri/library"
import { err, ok } from "@/lib/tauri/result"
import { createDocumentStore } from "@/store/document/documentStore"
import { createLibraryStore } from "@/store/session/libraryStore"
import { createUserComponentController, type UserComponentBackend } from "./userComponentController"

const fixture = new TextDecoder().decode(libraryFixtureBytes("component-asset.valid.json"))

function setup(overrides: Partial<UserComponentBackend> = {}) {
  const notify: Notifier = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() }
  const saved: string[] = []
  const backend: UserComponentBackend = {
    userNamespace: vi.fn(() => Promise.resolve(ok("u-abcdef"))),
    projectGeometrySizes: vi.fn((files: string[]) => Promise.resolve(ok(files.map(() => 500)))),
    addFromProject: vi.fn((text: string) => {
      saved.push(text)
      const { id, version } = (JSON.parse(text) as { identity: { id: string; version: string } })
        .identity
      const entry: LibraryEntry = {
        id,
        version,
        manifestSha256: "1".repeat(64),
        origin: "user",
        verified: false,
        manifest: text,
      }
      return Promise.resolve(ok([entry]))
    }),
    exportPack: vi.fn(() => Promise.resolve(ok({ components: 1, files: 2, bytes: 3 }))),
    ...overrides,
  }
  const document = createDocumentStore()
  const library = createLibraryStore()
  const controller = createUserComponentController({
    backend,
    document,
    library,
    notify,
    appVersion: "0.1.0",
    now: () => new Date("2026-10-31T12:34:56.789Z"),
  })
  return { notify, saved, backend, document, library, controller }
}

describe("user components (PLAN 9.7)", () => {
  it("opens with defaults, then saves the manifest it built", async () => {
    const t = setup()
    const nut = await generated("fastener.nut", { size: "M3" })
    const placed = instantiateComponent(createEmptyDocument("0.1.0"), { ...nut, pose: at(0, 0, 0) })
    t.document.getState().replaceDocument(mergeBatch(createEmptyDocument("0.1.0"), placed.batch))
    const parts = Object.keys(t.document.getState().doc.parts) as PartId[]
    await t.controller.open(parts)
    const save = t.library.getState().save
    if (save.phase !== "edit") throw new Error("not open")
    expect(save.namespace).toBe("u-abcdef")
    expect(save.defaults).toMatchObject({
      name: "Hex nut M3 (ISO 4032)",
      slug: "hex-nut-m3-iso-4032",
      version: "1.0.0",
      designatorPrefix: "H",
    })
    await t.controller.save({ ...save.defaults, licence: "cc0" })
    expect(t.library.getState().save.phase).toBe("idle")
    expect(t.library.getState().installed.map((r) => r.id)).toEqual([
      "u-abcdef/hex-nut-m3-iso-4032",
    ])
    const manifest = ComponentManifestSchema.parse(JSON.parse(t.saved[0] ?? ""))
    expect(manifest.authoring).toEqual({
      kind: "user",
      appVersion: "0.1.0",
      createdAt: "2026-10-31T12:34:56Z",
    })
    expect(Object.values(manifest.parts)[0]?.geometry).toMatchObject({ kind: "asset", bytes: 500 })
    expect(t.notify.success).toHaveBeenCalled()
  })

  it("keeps the dialog open with Rust's reason when the save is refused", async () => {
    const t = setup({
      addFromProject: () =>
        Promise.resolve(err({ kind: "invalidInput", message: "already in your library" })),
    })
    const nut = await generated("fastener.nut", { size: "M3" })
    const placed = instantiateComponent(createEmptyDocument("0.1.0"), { ...nut, pose: at(0, 0, 0) })
    t.document.getState().replaceDocument(mergeBatch(createEmptyDocument("0.1.0"), placed.batch))
    await t.controller.open(Object.keys(t.document.getState().doc.parts) as PartId[])
    const save = t.library.getState().save
    if (save.phase !== "edit") throw new Error("not open")
    await t.controller.save(save.defaults)
    expect(t.library.getState().save).toMatchObject({
      phase: "edit",
      error: "already in your library",
    })
  })

  it("adds a project's library component to the library once, never a reserved one", async () => {
    const t = setup()
    const manifest = ComponentManifestSchema.parse(JSON.parse(fixture))
    const ref = manifest.parts.body?.geometry
    if (ref?.kind !== "asset") throw new Error("fixture")
    const def = await definitionOf(manifest, "sideloaded")
    const placed = instantiateComponent(createEmptyDocument("0.1.0"), {
      def,
      assets: { body: assetFromManifest(ref, manifest.license.geometry) },
      pose: at(0, 0, 0),
    })
    t.document.getState().replaceDocument(mergeBatch(createEmptyDocument("0.1.0"), placed.batch))
    await t.controller.harvest(placed.instance)
    expect(JSON.parse(t.saved[0] ?? "")).toMatchObject({
      identity: { id: "acme/knob-15mm" },
      thumbnails: [],
    })
    expect(t.notify.success).toHaveBeenCalledWith(
      "Added Knob 15 mm to your library",
      expect.stringContaining("Unverified")
    )
    t.library.getState().setInstalled([
      {
        id: def.id,
        version: def.version,
        manifestSha256: "",
        origin: "sideloaded",
        verified: false,
        manifest: fixture,
      },
    ])
    await t.controller.harvest(placed.instance)
    expect(t.saved).toHaveLength(1)
    expect(t.notify.info).toHaveBeenCalledWith(expect.stringContaining("already in your library"))
    await t.controller.harvest("missing" as ComponentInstanceId)
    expect(t.saved).toHaveLength(1)
  })

  it("exports what may be passed on and refuses what may not", async () => {
    const t = setup()
    const record = {
      id: "acme/knob-15mm",
      version: "2.1.0-beta.1",
      manifestSha256: "",
      origin: "sideloaded" as const,
      verified: false,
      manifest: fixture,
    }
    await t.controller.exportPack(record)
    expect(t.backend.exportPack).toHaveBeenCalledWith(
      [{ id: record.id, version: record.version }],
      "knob-15-mm"
    )
    const closed = JSON.parse(fixture) as { license: { geometry: { redistributable: boolean } } }
    closed.license.geometry.redistributable = false
    await t.controller.exportPack({ ...record, manifest: JSON.stringify(closed) })
    expect(t.backend.exportPack).toHaveBeenCalledTimes(1)
    expect(t.notify.error).toHaveBeenCalledWith(
      expect.stringContaining("cannot be exported"),
      expect.stringContaining("does not allow")
    )
  })
})
