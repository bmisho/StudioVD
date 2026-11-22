// @vitest-environment node
import { describe, expect, it } from "vitest"
import type { CatalogIndex, ComponentInstanceId, SceneDocument } from "@/core/schema"
import { libraryFixture, libraryFixtureBytes, setAt } from "@/core/schema/testing/libraryFixtures"
import type { InstalledRecord } from "../items"
import { search, searchDoc } from "../search"
import { catalogItems, packSize } from "./catalogItems"
import { componentOffers } from "./offers"
import { oldVersions, packRows, revokedInstalls } from "./packs"
import { readCatalogIndex } from "./readIndex"

const text = (raw: unknown) => JSON.stringify(raw)
const KNOB = "acme/knob-15mm"
const PACK = "f".repeat(64)

function index(edit?: (raw: Record<string, unknown>) => void): CatalogIndex {
  const raw = libraryFixture("catalog.valid.json")
  edit?.(raw)
  const read = readCatalogIndex(text(raw))
  if (!read.ok) throw new Error(read.message)
  return read.index
}

const manifest = new TextDecoder().decode(libraryFixtureBytes("component-asset.valid.json"))
const record = (version: string, id = KNOB): InstalledRecord => ({
  id,
  version,
  manifestSha256: "0".repeat(64),
  origin: "official",
  verified: true,
  manifest,
})

describe("reading the catalog index (PLAN 4.4)", () => {
  it("accepts the fixture and refuses broken or hostile text", () => {
    expect(readCatalogIndex(text(libraryFixture("catalog.valid.json"))).ok).toBe(true)
    expect(readCatalogIndex("{")).toMatchObject({ ok: false })
    expect(readCatalogIndex('{"__proto__": {}}')).toMatchObject({ ok: false })
    const raw = libraryFixture("catalog.valid.json")
    setAt(raw, ["sequence"], -1)
    const bad = readCatalogIndex(text(raw))
    expect(!bad.ok && bad.message).toContain("sequence")
  })
})

describe("catalog cards (PLAN 14.5)", () => {
  it("lists what is not installed with its pack, and inserts what is", () => {
    const [card] = catalogItems(index(), [], "0.1.0")
    expect(card).toMatchObject({
      key: `cat:${KNOB}@2.1.0-beta.1`,
      source: "catalog",
      insert: null,
      catalog: { pack: PACK, bytes: 90000, installed: false },
      note: "Download its pack (90 kB) to insert it.",
    })
    const [installed] = catalogItems(index(), [record("2.1.0-beta.1")], "0.1.0")
    expect(installed?.insert?.kind).toBe("installed")
    expect(installed?.ownSourceOnly).toBe(true)
    // Listed under Online catalog, not twice under All sources.
    const docs = [installed].flatMap((i) => (i ? [searchDoc(i)] : []))
    expect(search(docs, "", "all")).toEqual([])
    expect(search(docs, "knob", "catalog")).toEqual([installed?.key])
  })

  it("says what is withdrawn, deprecated or for a newer app", () => {
    const withdrawn = index((raw) =>
      setAt(
        raw,
        ["revoked"],
        [{ id: KNOB, version: "2.1.0-beta.1", reason: "bad mesh", severity: "yanked" }]
      )
    )
    const [card] = catalogItems(withdrawn, [], "0.1.0")
    expect(card?.badges).toContain("revoked")
    expect(card?.note).toContain("bad mesh")
    const [old] = catalogItems(index(), [record("2.1.0-beta.1")], "2.5.0")
    expect(old?.badges).toContain("newer")
    expect(old?.insert).toBeNull()
    expect(packSize(1_500_000)).toBe("1.5 MB")
  })
})

describe("packs (PLAN 14.5)", () => {
  it("rows per bundle with their install state", () => {
    expect(packRows(index(), [])[0]).toMatchObject({ label: "All knobs", status: "available" })
    expect(packRows(index(), [record("2.1.0-beta.1")])[0]?.status).toBe("installed")
    expect(packRows(index(), [record("1.0.0")])[0]?.status).toBe("update")
    const loose = index((raw) => setAt(raw, ["bundles"], []))
    expect(packRows(loose, [])[0]?.label).toBe("Knob 15 mm")
  })

  it("old versions and withdrawn installs", () => {
    const all = [record("1.0.0"), record("2.1.0-beta.1"), record("1.0.0", "acme/other")]
    expect(oldVersions(all).map((r) => r.version)).toEqual(["1.0.0"])
    const withdrawn = index((raw) =>
      setAt(
        raw,
        ["revoked"],
        [{ id: KNOB, version: "1.0.0", reason: "unsafe", severity: "security" }]
      )
    )
    expect(revokedInstalls(withdrawn, all)).toEqual([
      { id: KNOB, version: "1.0.0", reason: "unsafe", severity: "security" },
    ])
  })
})

describe("component offers (PLAN 14.6)", () => {
  const doc = (version: string, origin = "official") =>
    ({
      components: { c1: { id: "c1", def: "d1" } },
      componentDefs: { d1: { id: KNOB, version, origin } },
    }) as unknown as Pick<SceneDocument, "components" | "componentDefs">
  const c1 = "c1" as ComponentInstanceId

  it("offers the newest same-MAJOR release as an Update, a new MAJOR as a Replace", () => {
    const installed = [record("1.2.0"), record("1.3.0-beta.1"), record("1.1.0")]
    expect(componentOffers(doc("1.0.0"), installed, null)[c1]).toMatchObject({
      kind: "update",
      to: "1.2.0", // prereleases are not offered
      installed: true,
    })
    expect(componentOffers(doc("1.2.0"), [record("3.0.0")], null)[c1]).toMatchObject({
      kind: "replace",
      to: "3.0.0",
    })
  })

  it("names the catalog pack when only the catalog has it; nothing for generators", () => {
    const raw = libraryFixture("catalog.valid.json")
    setAt(raw, ["components", 0, "version"], "2.2.0")
    setAt(raw, ["bundles"], [])
    const read = readCatalogIndex(text(raw))
    if (!read.ok) throw new Error(read.message)
    expect(componentOffers(doc("2.0.0"), [], read.index)[c1]).toEqual({
      kind: "update",
      id: KNOB,
      from: "2.0.0",
      to: "2.2.0",
      installed: false,
      pack: PACK,
    })
    expect(componentOffers(doc("1.0.0", "generator"), [record("2.0.0")], null)).toEqual({})
  })
})
