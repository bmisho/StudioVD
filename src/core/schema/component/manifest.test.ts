// @vitest-environment node
import { describe, expect, it } from "vitest"
import { libraryFixture, libraryFixtureBytes, setAt } from "../testing/libraryFixtures"
import { ComponentManifestSchema } from "./manifest"
import { checkManifest, readManifest } from "./readManifest"

const GENERATED = "component-generated.valid.json"
const ASSET = "component-asset.valid.json"
const errorPaths = (raw: unknown) => {
  const r = ComponentManifestSchema.safeParse(raw)
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."))
}

describe("component.json (PLAN 4.3, 4.7)", () => {
  it("accepts the valid fixtures: generated rings with a mate; a pack asset with maps", () => {
    for (const name of [GENERATED, ASSET]) expect(errorPaths(libraryFixture(name))).toEqual([])
    const read = readManifest(libraryFixtureBytes(GENERATED), "0.9.0", true)
    expect(read.ok && read.manifest.parts.inner?.name).toBe("Inner ring")
  })

  // Each case: what is changed, and the path the refusal names.
  const cases: [string, string, (string | number)[], unknown, string][] = [
    ["an unknown top-level key", GENERATED, ["schematic"], {}, ""],
    ["no parts", ASSET, ["parts"], {}, "parts"],
    ["a root part that is not a part", ASSET, ["rootPart"], "lid", "rootPart"],
    [
      "a part's material that is missing",
      ASSET,
      ["parts", "body", "material"],
      "pom",
      "parts.body.material",
    ],
    [
      "a slot's material that is missing",
      ASSET,
      ["parts", "body", "materialSlots", 0, "material"],
      "gold",
      "parts.body.materialSlots.0.material",
    ],
    [
      "an anchor on a missing part",
      ASSET,
      ["anchors", "shaft", "part"],
      "lid",
      "anchors.shaft.part",
    ],
    [
      "a mate with a missing anchor",
      GENERATED,
      ["mates", "spin", "anchorB"],
      "nope",
      "mates.spin.anchorB",
    ],
    ["a mate within one part", GENERATED, ["mates", "spin", "anchorB"], "face", "mates.spin"],
    [
      "a generator not in requires",
      GENERATED,
      ["identity", "requires", "generators"],
      {},
      "parts.outer.geometry",
    ],
    [
      "an asset path not named by its hash",
      ASSET,
      ["parts", "body", "geometry", "path"],
      "geometry/x.glb",
      "parts.body.geometry",
    ],
    [
      "a scaled part (a quaternion off unit length)",
      ASSET,
      ["parts", "body", "transform", "quaternion"],
      [0, 0, 0, 2],
      "parts.body.transform.quaternion",
    ],
    [
      "an axis off unit length",
      ASSET,
      ["anchors", "shaft", "frame", "z"],
      [0, 0, -2],
      "anchors.shaft.frame.z",
    ],
    [
      "an http (not https) link",
      ASSET,
      ["identity", "datasheetUrl"],
      "http://example.com",
      "identity.datasheetUrl",
    ],
    [
      "a javascript: link",
      ASSET,
      ["license", "geometry", "sourceUrl"],
      "javascript:alert(1)",
      "license.geometry.sourceUrl",
    ],
    ["a control character in a name", ASSET, ["identity", "name"], "Knob\u0007", "identity.name"],
    ["a name with outer spaces", ASSET, ["identity", "name"], " Knob", "identity.name"],
    ["a version that is not SemVer", ASSET, ["identity", "version"], "2.1", "identity.version"],
    ["a component id without a namespace", ASSET, ["identity", "id"], "knob", "identity.id"],
    [
      "a reserved key",
      ASSET,
      ["materials"],
      { constructor: { kind: "builtin", key: "std.abs" } },
      "materials.constructor",
    ],
    [
      "a thumbnail that is not PNG",
      ASSET,
      ["thumbnails", 0, "path"],
      "components/a/b/c/t.svg",
      "thumbnails.0.path",
    ],
    [
      "a licence text not named by its hash",
      ASSET,
      ["license", "geometry", "licenseText", "path"],
      "licenses/x.txt",
      "license.geometry.licenseText",
    ],
    [
      "a revolute limit past a turn",
      GENERATED,
      ["mates", "spin", "limits"],
      { min: -7, max: 0 },
      "mates.spin.limits",
    ],
  ]
  it.each(cases)("refuses %s", (_what, name, path, value, at) => {
    const raw = libraryFixture(name)
    setAt(raw, path, value)
    expect(errorPaths(raw)).toContain(at)
  })

  it("refuses more than 64 parts", () => {
    const raw = libraryFixture(ASSET)
    const body = (raw.parts as Record<string, unknown>).body
    raw.parts = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`p${i}`, body]))
    raw.rootPart = "p0"
    expect(errorPaths(raw)).toContain("parts")
  })
})

describe("reading a manifest", () => {
  it("lists one made for a newer StudioVD as such, before the strict schema", () => {
    const raw = libraryFixture(ASSET)
    setAt(raw, ["identity", "requires", "app"], ">=99.0.0")
    setAt(raw, ["futureField"], { anything: true })
    expect(checkManifest(raw, "0.9.0")).toEqual({ ok: false, reason: "newer", needs: ">=99.0.0" })
    setAt(raw, ["schemaVersion"], 2)
    expect(checkManifest(raw, "0.9.0")).toMatchObject({ reason: "newer" })
  })

  it("keeps reserved namespaces to the app's own and signed manifests", () => {
    const bytes = libraryFixtureBytes(GENERATED) // gen/bearing-608-2rs
    expect(readManifest(bytes, "0.9.0", false)).toMatchObject({ ok: false, reason: "invalid" })
    expect(readManifest(bytes, "0.9.0", true).ok).toBe(true)
  })

  it("refuses bytes that are not small, well-formed, finite JSON", () => {
    const text = (s: string) => new TextEncoder().encode(s)
    expect(readManifest(new Uint8Array([0xff, 0xfe]), "0.9.0")).toMatchObject({ reason: "invalid" })
    expect(readManifest(text("{"), "0.9.0")).toMatchObject({ reason: "invalid" })
    expect(readManifest(text('{"a":1e400}'), "0.9.0")).toMatchObject({ reason: "invalid" })
    expect(readManifest(text(`${"[".repeat(40)}${"]".repeat(40)}`), "0.9.0")).toMatchObject({
      reason: "invalid",
    })
    expect(readManifest(new Uint8Array(4 * 1024 * 1024 + 1), "0.9.0")).toMatchObject({
      reason: "invalid",
    })
  })
})
