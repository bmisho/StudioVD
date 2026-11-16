import { describe, expect, it } from "vitest"
import { ComponentManifestSchema } from "@/core/schema"
import fixture from "@/core/schema/testing/fixtures/library/component-asset.valid.json"
import type { InstalledRecord } from "../items"
import { savedVersions } from "./defaults"

const record = (version: string, name: string): InstalledRecord => {
  const manifest = structuredClone(ComponentManifestSchema.parse(fixture))
  manifest.identity.version = version
  manifest.identity.name = name
  return {
    id: manifest.identity.id,
    version,
    manifestSha256: "0".repeat(64),
    origin: "user",
    verified: false,
    manifest: JSON.stringify(manifest),
  }
}

describe("saved versions", () => {
  it("takes the newest by SemVer, not by the library's text order", () => {
    // The library lists by text: 1.10.0 sorts before 1.9.0.
    const installed = [record("1.10.0", "Tenth"), record("1.9.0", "Ninth")]
    const { versions, latest } = savedVersions(installed, "acme/knob-15mm", "0.1.0")
    expect(versions).toEqual(["1.10.0", "1.9.0"])
    expect(latest?.identity.name).toBe("Tenth")
    expect(savedVersions(installed, "acme/other", "0.1.0")).toEqual({
      versions: [],
      latest: undefined,
    })
  })
})
