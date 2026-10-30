import { describe, expect, it } from "vitest"
import { libraryFixtureBytes } from "@/core/schema/testing/libraryFixtures"
import { checkStagedPack } from "./packCheck"

const text = new TextDecoder().decode(libraryFixtureBytes("component-asset.valid.json"))
const manifest = JSON.parse(text) as { identity: { id: string; version: string } }
const { id, version } = manifest.identity

describe("checkStagedPack (Install from file)", () => {
  it("accepts valid components matching pack.json", () => {
    const { checks, installable } = checkStagedPack([{ id, version, manifest: text }], "0.1.0")
    expect(installable).toBe(true)
    expect(checks[0]).toMatchObject({ status: "ok", name: "Knob 15 mm" })
  })

  it("refuses a component that is not what pack.json says, or invalid, or in a reserved namespace", () => {
    expect(
      checkStagedPack([{ id: "acme/other", version, manifest: text }], "0.1.0").installable
    ).toBe(false)
    expect(checkStagedPack([{ id, version, manifest: "{" }], "0.1.0").checks[0]?.status).toBe(
      "invalid"
    )
    const official = text.replace(`"${id}"`, '"official/knob"')
    const r = checkStagedPack([{ id: "official/knob", version, manifest: official }], "0.1.0")
    expect(r.installable).toBe(false)
  })

  it("installs one made for a newer StudioVD, listing it as such", () => {
    const newer = text.replace('">=0.1.0 <2.0.0"', '">=9.0.0"')
    const { checks, installable } = checkStagedPack([{ id, version, manifest: newer }], "0.1.0")
    expect(installable).toBe(true)
    expect(checks[0]?.status).toBe("newer")
    expect(checkStagedPack([], "0.1.0").installable).toBe(false)
  })
})
