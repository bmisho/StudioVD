import { SCHEMA_VERSION } from "./document"

export type JsonObject = Record<string, unknown>

/** Upgrades a vN document to vN+1. Pure; typed against frozen vN shapes, never the live schema. */
export type Migration = (doc: JsonObject) => { doc: JsonObject; warnings?: string[] }

/**
 * `MIGRATIONS[n]` turns format n into n+1 (PLAN 5.1). A released entry is never edited:
 * files in the wild depend on it. Each one comes with a frozen `vN` fixture test.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  /** v1 → v2 (Phase 9.6): derived connectors (belts, tubes, springs) get their collection. */
  1: (doc) => ({ doc: { ...doc, connectors: {} } }),
}

export type MigrateResult =
  | { ok: true; doc: JsonObject; fromVersion: number; warnings: string[] }
  | { ok: false; message: string }

const isObject = (v: unknown): v is JsonObject =>
  typeof v === "object" && v !== null && !Array.isArray(v)

/** `appVersion` of an untrusted file, safe to show: printable, short. */
export function savedByOf(raw: JsonObject): string {
  const v = raw.appVersion
  return typeof v === "string" ? v.replace(/[^\x20-\x7e]/g, "").slice(0, 32) || "?" : "?"
}

/**
 * Reads the header (`format`, `schemaVersion`) and upgrades the document to `current`.
 * Takes ownership of `raw`: migrations may change it in place. A file from a newer
 * StudioVD is refused with a message saying so, not with a list of unknown fields.
 */
export function migrate(
  raw: unknown,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
  current: number = SCHEMA_VERSION
): MigrateResult {
  if (!isObject(raw) || raw.format !== "studiovd")
    return { ok: false, message: "This is not a StudioVD project." }
  const version = raw.schemaVersion
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1)
    return { ok: false, message: "The project's format version is not valid." }
  if (version > current)
    return {
      ok: false,
      message:
        `Saved with StudioVD ${savedByOf(raw)} (format ${version}); this version opens ` +
        `format ${current} and older. Update StudioVD to open it.`,
    }
  let doc = raw
  const warnings: string[] = []
  for (let n = version; n < current; n++) {
    const step = Object.hasOwn(migrations, n) ? migrations[n] : undefined
    if (!step) return { ok: false, message: `No upgrade from format ${n} exists.` }
    try {
      const out = step(doc)
      doc = out.doc
      warnings.push(...(out.warnings ?? []))
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      return { ok: false, message: `Upgrading from format ${n} failed: ${reason}` }
    }
    doc.schemaVersion = n + 1
  }
  return { ok: true, doc, fromVersion: version, warnings }
}
