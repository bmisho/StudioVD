import { describe, expect, it } from "vitest"
import { SCHEMA_VERSION } from "./document"
import { migrate, MIGRATIONS, type Migration } from "./migrate"

const header = (schemaVersion: unknown, extra: object = {}) => ({
  format: "studiovd",
  schemaVersion,
  appVersion: "0.1.0",
  ...extra,
})

describe("migrate", () => {
  it("has exactly one step for every older format", () => {
    const steps = Object.keys(MIGRATIONS).map(Number)
    expect(steps.sort()).toEqual(Array.from({ length: SCHEMA_VERSION - 1 }, (_, i) => i + 1))
  })

  it("passes a current document through untouched", () => {
    const doc = header(SCHEMA_VERSION, { parts: {} })
    expect(migrate(doc)).toEqual({ ok: true, doc, fromVersion: SCHEMA_VERSION, warnings: [] })
  })

  it("refuses files that are not StudioVD projects or carry no valid version", () => {
    for (const raw of [null, [], "x", { format: "other", schemaVersion: 1 }]) {
      expect(migrate(raw)).toEqual({ ok: false, message: "This is not a StudioVD project." })
    }
    for (const version of [0, -1, 1.5, "1", undefined, Number.MAX_SAFE_INTEGER + 2]) {
      const result = migrate(header(version))
      expect(result).toEqual({ ok: false, message: "The project's format version is not valid." })
    }
  })

  it("refuses a newer format by name, with a printable app version", () => {
    const result = migrate(header(SCHEMA_VERSION + 1, { appVersion: "9.0.0\u0007‮" }))
    expect(result).toEqual({
      ok: false,
      message: `Saved with StudioVD 9.0.0 (format ${SCHEMA_VERSION + 1}); this version opens format ${SCHEMA_VERSION} and older. Update StudioVD to open it.`,
    })
  })

  it("runs every step in order, stamps each version and collects warnings", () => {
    const seen: number[] = []
    const step =
      (n: number): Migration =>
      (doc) => {
        seen.push(doc.schemaVersion as number)
        return { doc: { ...doc, [`v${n + 1}`]: true }, warnings: [`to ${n + 1}`] }
      }
    const result = migrate(header(1), { 1: step(1), 2: step(2) }, 3)
    expect(seen).toEqual([1, 2])
    expect(result).toEqual({
      ok: true,
      doc: { ...header(3), v2: true, v3: true },
      fromVersion: 1,
      warnings: ["to 2", "to 3"],
    })
  })

  it("reports the step that failed, or a missing one", () => {
    const boom: Migration = () => {
      throw new Error("bad joint")
    }
    expect(migrate(header(1), { 1: (doc) => ({ doc }), 2: boom }, 3)).toEqual({
      ok: false,
      message: "Upgrading from format 2 failed: bad joint",
    })
    expect(migrate(header(1), { 1: (doc) => ({ doc }) }, 3)).toEqual({
      ok: false,
      message: "No upgrade from format 2 exists.",
    })
  })
})
