import { describe, expect, it } from "vitest"
import { ComponentManifestSchema, LocalKeySchema } from "@/core/schema"
import fixture from "@/core/schema/testing/fixtures/library/component-asset.valid.json"
import { localKey, plain, slugFor, tagsFrom } from "./keys"
import { andSpdx } from "./licence"
import { exportRefusal, suggestVersion } from "./version"

describe("names to identifiers", () => {
  it("makes valid, unique local keys", () => {
    const taken = new Set<string>()
    const keys = [
      localKey("Ø8 shaft", taken, "part"),
      localKey("Grundplatte (groß)", taken, "part"),
      localKey("Grundplatte (groß)", taken, "part"),
      localKey("constructor", taken, "part"),
      localKey("", taken, "part"),
      localKey("x".repeat(40), taken, "part"),
      localKey("x".repeat(40), taken, "part"),
    ]
    expect(keys).toEqual([
      "part_8_shaft",
      "Grundplatte_gro",
      "Grundplatte_gro_2",
      "constructor_2",
      "part",
      "x".repeat(32),
      `${"x".repeat(30)}_2`,
    ])
    for (const k of keys) expect(LocalKeySchema.safeParse(k).success).toBe(true)
  })

  it("makes slugs, tags and plain text", () => {
    expect(slugFor("Mein Gehäuse!")).toBe("mein-gehause")
    expect(slugFor("***")).toBe("component")
    expect(tagsFrom(" Motor, NEMA 17,motor,, ünïcode ")).toEqual(["motor", "nema 17", "ncode"])
    expect(plain("  line\none\t ", 80)).toBe("line one")
  })

  it("joins SPDX terms once each, compound ones in parentheses", () => {
    expect(andSpdx(["CC0-1.0"])).toBe("CC0-1.0")
    expect(andSpdx(["MIT", "CC-BY-SA-4.0 WITH KiCad-libraries-exception", "MIT"])).toBe(
      "MIT AND (CC-BY-SA-4.0 WITH KiCad-libraries-exception)"
    )
  })
})

describe("versions and export", () => {
  const keys = (parts: string[], anchors: string[] = []) => ({
    parts: Object.fromEntries(parts.map((k) => [k, {}])),
    anchors: Object.fromEntries(anchors.map((k) => [k, {}])),
    mates: {},
    materials: {},
  })

  it("bumps MAJOR for a key removed, MINOR for keys added, else PATCH", () => {
    const before = keys(["a"], ["top"]) as never
    expect(suggestVersion([], undefined, before)).toBe("1.0.0")
    expect(suggestVersion(["1.0.0", "1.2.3", "0.9.0"], before, before)).toBe("1.2.4")
    expect(suggestVersion(["1.2.3"], before, keys(["a", "b"], ["top"]) as never)).toBe("1.3.0")
    expect(suggestVersion(["1.2.3"], before, keys(["a"]) as never)).toBe("2.0.0")
    expect(suggestVersion(["1.3.0-beta.1"], before, before)).toBe("1.3.0")
  })

  it("refuses to pass on what may not be passed on, unless it is the user's own", () => {
    const manifest = ComponentManifestSchema.parse(fixture)
    expect(exportRefusal(manifest, false)).toBeNull()
    const closed = structuredClone(manifest)
    closed.license.geometry.redistributable = false
    expect(exportRefusal(closed, false)).toMatch(/does not allow/)
    expect(exportRefusal(closed, true)).toBeNull()
    const built = structuredClone(manifest)
    built.license.inherited = [
      {
        component: "acme/knob-15mm" as never,
        version: "1.0.0",
        grant: closed.license.geometry,
      },
    ]
    expect(exportRefusal(built, true)).toMatch(/built from acme\/knob-15mm/)
  })
})
