import { describe, expect, it, vi } from "vitest"
import { prepareGenerated } from "@/core/generators/prepare"
import { findGenerator } from "@/core/generators/registry"
import { ComponentManifestSchema, type GeneratorParams } from "@/core/schema"
import { libraryFixtureBytes } from "@/core/schema/testing/libraryFixtures"
import { ok } from "@/lib/tauri/result"
import { prepareInsertion, type InsertionBackend } from "./prepareInsertion"

function backend() {
  const written: string[] = []
  const b: InsertionBackend = {
    generate: (id: string, major: number, params: GeneratorParams) => {
      const gen = findGenerator(id, major)
      if (!gen) throw new Error(`no ${id}`)
      return prepareGenerated(gen, params)
    },
    writeAsset: vi.fn((id: string) => {
      written.push(id)
      return Promise.resolve(ok(true))
    }),
    copyComponentIntoProject: vi.fn(() => Promise.resolve(ok(3))),
  }
  return { b, written }
}
const manifestText = (name: string) => new TextDecoder().decode(libraryFixtureBytes(name))

describe("prepareInsertion", () => {
  it("runs a generator and writes the assets the project lacks", async () => {
    const { b, written } = backend()
    const ref = {
      kind: "generator" as const,
      id: "bearing.deepGroove",
      major: 1,
      params: { boreMm: 8, outerMm: 22, widthMm: 7, seal: "ZZ" },
    }
    const ready = await prepareInsertion(ref, b, () => ({}))
    expect(Object.keys(ready.assets)).toEqual(["outer", "inner"])
    expect(written).toEqual(Object.values(ready.assets).map((a) => a.id))
    expect(ready.def.origin).toBe("generator")
    // Known assets are not sent again.
    const again = backend()
    await prepareInsertion(ref, again.b, () => Object.fromEntries(written.map((id) => [id, {}])))
    expect(again.written).toEqual([])
  })

  it("copies an installed component's blobs and records its geometry under its licence", async () => {
    const { b, written } = backend()
    const text = manifestText("component-asset.valid.json")
    const manifest = ComponentManifestSchema.parse(JSON.parse(text))
    const ref = {
      kind: "installed" as const,
      id: manifest.identity.id,
      version: manifest.identity.version,
      origin: "sideloaded" as const,
      manifest,
      manifestSha256: "0".repeat(64),
      text,
    }
    const ready = await prepareInsertion(ref, b, () => ({}))
    expect(b.copyComponentIntoProject).toHaveBeenCalledWith(ref.id, ref.version)
    expect(written).toEqual([])
    for (const a of Object.values(ready.assets))
      expect(a.license?.spdx).toBe(manifest.license.geometry.spdx)
    expect(ready.def.origin).toBe("sideloaded")
    expect(ready.licenseTexts.map((l) => l.text.path)).toEqual([
      ...new Set(
        [manifest.license.geometry, manifest.license.data].flatMap((g) =>
          g.licenseText ? [g.licenseText.path] : []
        )
      ),
    ])
  })

  it("records the licence texts a component inherited from library parts", async () => {
    const { b } = backend()
    const text = manifestText("component-asset.valid.json")
    const manifest = ComponentManifestSchema.parse(JSON.parse(text))
    const sha = "d".repeat(64)
    const grant = {
      ...manifest.license.geometry,
      licenseText: { path: `licenses/${sha}.txt`, sha256: sha },
    }
    manifest.license.inherited = [{ grant }]
    const ref = {
      kind: "installed" as const,
      id: manifest.identity.id,
      version: manifest.identity.version,
      origin: "user" as const,
      manifest,
      manifestSha256: "0".repeat(64),
      text,
    }
    const ready = await prepareInsertion(ref, b, () => ({}))
    expect(ready.licenseTexts.map((l) => l.sha256)).toContain(sha)
  })

  it("makes the generated parts of an installed component with their generator, once", async () => {
    const { b, written } = backend()
    const generate = vi.spyOn(b, "generate")
    const text = manifestText("component-generated.valid.json")
    const manifest = ComponentManifestSchema.parse(JSON.parse(text))
    const ref = {
      kind: "installed" as const,
      id: manifest.identity.id,
      version: manifest.identity.version,
      origin: "official" as const,
      manifest,
      manifestSha256: "0".repeat(64),
      text,
    }
    const ready = await prepareInsertion(ref, b, () => ({}))
    expect(generate).toHaveBeenCalledTimes(1) // both rings come from one run
    expect(Object.keys(ready.assets)).toEqual(["outer", "inner"])
    expect(written).toHaveLength(2)
  })
})
