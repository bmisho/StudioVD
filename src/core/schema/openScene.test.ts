import { describe, expect, it } from "vitest"
import { SCENE_LIMITS } from "./caps"
import { parseDocument, SCHEMA_VERSION, type SceneDocument } from "./document"
import { isNewerVersion, openSceneBytes, serializeScene } from "./openScene"
import { asJson, sampleDocument, uuid } from "./testing/sampleDocument"

const bytes = (text: string) => new TextEncoder().encode(text)
const open = (value: unknown) => openSceneBytes(bytes(JSON.stringify(value)), "0.1.0")
const saved = (doc: SceneDocument) => {
  const result = serializeScene(doc, "0.2.0")
  if (!result.ok) throw new Error(JSON.stringify(result.problems))
  return result.json
}

describe("serializeScene + openSceneBytes", () => {
  it("round-trips a document, stamped with the saving app's version", () => {
    const doc = sampleDocument()
    const result = openSceneBytes(bytes(saved(doc)), "0.2.0")
    expect(result).toEqual({
      ok: true,
      document: { ...doc, appVersion: "0.2.0" },
      fromVersion: SCHEMA_VERSION,
      warnings: [],
    })
  })

  it("refuses to write a document it would refuse to open", () => {
    const doc = sampleDocument()
    const [, part] = Object.entries(doc.parts)[0] ?? []
    if (!part) throw new Error("no part")
    part.parentId = uuid(404) as typeof part.parentId
    const result = serializeScene(doc, "0.2.0")
    expect(result.ok).toBe(false)
  })
})

describe("openSceneBytes refuses", () => {
  it("oversized, non-UTF-8, non-JSON and over-nested input", () => {
    const big = new Uint8Array(SCENE_LIMITS.maxBytes + 1)
    expect(openSceneBytes(big, "0.1.0")).toMatchObject({
      ok: false,
      message: "scene.json is too large.",
    })
    expect(openSceneBytes(new Uint8Array([0x7b, 0xff, 0x7d]), "0.1.0")).toMatchObject({
      message: "scene.json is not valid UTF-8 text.",
    })
    const syntax = openSceneBytes(bytes("{"), "0.1.0")
    expect(!syntax.ok && syntax.message.startsWith("scene.json is not valid JSON")).toBe(true)
    expect(openSceneBytes(bytes("[".repeat(100_000)), "0.1.0")).toMatchObject({
      message: "scene.json is nested too deeply.",
    })
  })

  it("a __proto__ record key, which zod alone silently drops", () => {
    const json = asJson(sampleDocument())
    const text = JSON.stringify(json).replace('"parts":{', '"parts":{"__proto__":{"evil":1},')
    // The regression: without the pre-parse scan, the schema accepts this file.
    expect(parseDocument(JSON.parse(text)).ok).toBe(true)
    expect(openSceneBytes(bytes(text), "0.1.0")).toEqual({
      ok: false,
      message: "scene.json holds data this app does not accept.",
      problems: [{ path: "parts.__proto__", message: 'reserved key "__proto__"' }],
    })
  })

  it("ids that are not UUIDs, such as prototype names", () => {
    const json = asJson(sampleDocument())
    json.groups = { toString: { id: "toString", name: "G", parentId: null } }
    const result = open(json)
    expect(!result.ok && result.problems.some((p) => p.path.startsWith("groups.toString"))).toBe(
      true
    )
  })

  it("collections a later phase owns, unless empty", () => {
    const json = asJson(sampleDocument())
    const id = uuid(1)
    json.materials = {
      [id]: {
        id,
        name: "Steel",
        color: "#888888",
        metalness: 1,
        roughness: 0.3,
        opacity: 1,
        densityKgM3: 7850,
      },
    }
    const result = open(json)
    expect(result).toMatchObject({
      ok: false,
      problems: [{ path: "materials", message: "Materials are not supported yet (Phase 6)" }],
    })
  })

  it("inconsistent contents, with the paths at fault", () => {
    const doc = sampleDocument()
    const [key, part] = Object.entries(doc.parts)[0] ?? []
    if (!key || !part) throw new Error("no part")
    part.assetId = "f".repeat(64) as typeof part.assetId
    expect(open(doc)).toEqual({
      ok: false,
      message: "The project's contents are inconsistent.",
      problems: [{ path: `parts.${key}.assetId`, message: "refers to something that is missing" }],
    })
  })

  it("schema failures, hinting at a newer app when the file says so", () => {
    const json = { ...asJson(sampleDocument()), appVersion: "3.1.0", futureField: 1 }
    const result = open(json)
    expect(!result.ok && result.message).toBe(
      "The project does not match the file format. It was saved by a newer StudioVD (3.1.0); updating may help."
    )
  })

  it("garbage, without throwing", () => {
    for (const text of ["null", "42", '"x"', "[]", "{}", '{"format":"studiovd"}'])
      expect(openSceneBytes(bytes(text), "0.1.0").ok).toBe(false)
  })
})

describe("isNewerVersion", () => {
  it("compares major.minor.patch numerically", () => {
    expect(isNewerVersion("0.10.0", "0.9.9")).toBe(true)
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false)
    expect(isNewerVersion("0.9.0", "0.10.0")).toBe(false)
    expect(isNewerVersion("garbage", "0.1.0")).toBe(false)
  })
})
