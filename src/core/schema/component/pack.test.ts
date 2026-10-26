// @vitest-environment node
import { describe, expect, it } from "vitest"
import { libraryFixture, setAt } from "../testing/libraryFixtures"
import { CatalogIndexSchema } from "./catalogIndex"
import { PackManifestSchema, packFileKind } from "./pack"

const errorPaths = (
  schema: typeof PackManifestSchema | typeof CatalogIndexSchema,
  raw: unknown
) => {
  const r = schema.safeParse(raw)
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."))
}
const sha = (c: string) => c.repeat(64)

describe("pack.json (PLAN 4.4)", () => {
  it("accepts the valid fixture", () => {
    expect(errorPaths(PackManifestSchema, libraryFixture("pack.valid.json"))).toEqual([])
  })

  const cases: [string, (string | number)[], unknown, string][] = [
    ["a script", ["files", 1, "path"], "scripts/run.js", "files.1.path"],
    [
      "an SVG",
      ["files", 1, "path"],
      "components/acme/knob-15mm/2.1.0-beta.1/thumbnail.svg",
      "files.1.path",
    ],
    ["a path climbing out", ["files", 1, "path"], "components/../../evil.png", "files.1.path"],
    ["a backslash", ["files", 2, "path"], `geometry\\${sha("a")}.glb`, "files.2.path"],
    ["geometry not named by its hash", ["files", 2, "sha256"], sha("9"), "files.2.path"],
    ["a GLB over the cap", ["files", 2, "bytes"], 64 * 1024 * 1024 + 1, "files.2.path"],
    [
      "a manifest at another path",
      ["components", 0, "manifestPath"],
      "component.json",
      "components.0.manifestPath",
    ],
    [
      "a manifest hash the file list does not hold",
      ["components", 0, "manifestSha256"],
      sha("9"),
      "components.0.manifestSha256",
    ],
  ]
  it.each(cases)("refuses %s", (_what, path, value, at) => {
    const raw = libraryFixture("pack.valid.json")
    setAt(raw, path, value)
    expect(errorPaths(PackManifestSchema, raw)).toContain(at)
  })

  it("refuses two files whose names differ only by case (one file on Windows)", () => {
    const raw = libraryFixture("pack.valid.json")
    const files = raw.files as { path: string }[]
    files.push({
      ...(files[1] ?? { path: "" }),
      path: (files[1]?.path ?? "").replace("thumbnail", "Thumbnail"),
    })
    expect(errorPaths(PackManifestSchema, raw)).toContain("files.5.path")
  })

  it("names each kind of file a pack may hold", () => {
    expect(packFileKind(`licenses/${sha("c")}.txt`)?.kind).toBe("license")
    expect(packFileKind(`textures/${sha("b")}.jpg`)?.kind).toBe("texture")
    expect(packFileKind("pack.json")).toBeNull() // the manifest of the pack itself is not listed
  })
})

describe("catalog index (PLAN 4.4)", () => {
  it("accepts the valid fixture", () => {
    expect(errorPaths(CatalogIndexSchema, libraryFixture("catalog.valid.json"))).toEqual([])
  })

  const cases: [string, (string | number)[], unknown, string][] = [
    [
      "a component in a pack it does not list",
      ["components", 0, "pack"],
      sha("9"),
      "components.0.pack",
    ],
    [
      "a pack whose key is not its hash",
      ["packs", sha("f"), "sha256"],
      sha("9"),
      `packs.${sha("f")}.sha256`,
    ],
    [
      "a bundle naming an unlisted component",
      ["bundles", 0, "components", 0, "version"],
      "9.9.9",
      "bundles.0.components.0",
    ],
    ["an expiry before generation", ["expiresAt"], "2026-10-01T00:00:00Z", "expiresAt"],
    ["a plain-http mirror", ["mirrors", 0], "http://example.com", "mirrors.0"],
    ["a key id that is not 16 hex digits", ["signingKeyId"], "xyz", "signingKeyId"],
  ]
  it.each(cases)("refuses %s", (_what, path, value, at) => {
    const raw = libraryFixture("catalog.valid.json")
    setAt(raw, path, value)
    expect(errorPaths(CatalogIndexSchema, raw)).toContain(at)
  })
})
