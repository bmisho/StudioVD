import { z } from "zod"
import { jsonTextShape, scanJsonValue, type DocumentProblem, type ScanLimits } from "../scanJson"
import { safeSegment, shownProblem } from "../shown"
import { ComponentManifestSchema, type ComponentManifest } from "./manifest"
import { satisfies } from "./semver"
import { RESERVED_NAMESPACES, namespaceOf } from "./text"

/** A `component.json` is small: bounded before anything is parsed (an untrusted file). */
export const MANIFEST_LIMITS: ScanLimits & { maxBytes: number } = {
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 16,
  maxValues: 200_000,
  maxString: 8192,
}

export type ReadManifestResult =
  | { ok: true; manifest: ComponentManifest }
  /** Made for a newer StudioVD: listed as such, not read further. */
  | { ok: false; reason: "newer"; needs: string }
  | { ok: false; reason: "invalid"; message: string; problems: DocumentProblem[] }

const invalid = (message: string, problems: DocumentProblem[] = []): ReadManifestResult => ({
  ok: false,
  reason: "invalid",
  message,
  problems: problems.slice(0, 20).map(shownProblem),
})

/** Just what says which app a manifest is for, read before the strict schema. */
const EnvelopeSchema = z
  .object({
    format: z.literal("studiovd-component"),
    schemaVersion: z.number().int().positive(),
    identity: z.object({ requires: z.object({ app: z.string().max(128) }).loose() }).loose(),
  })
  .loose()

/**
 * Reads an already parsed manifest (PLAN 4.7): the app versions it needs first, so a
 * manifest made for a newer StudioVD reads as such instead of as broken, then the strict
 * schema. `trusted`: the app's own (generator presets) or verified by a signature; anything
 * else may not use a reserved namespace (`official/…`, `gen/…`).
 */
export function checkManifest(
  raw: unknown,
  appVersion: string,
  trusted = false
): ReadManifestResult {
  const envelope = EnvelopeSchema.safeParse(raw)
  if (!envelope.success) return invalid("This is not a StudioVD component.")
  const { schemaVersion, identity } = envelope.data
  if (schemaVersion > 1)
    return { ok: false, reason: "newer", needs: `component format ${schemaVersion}` }
  if (!satisfies(appVersion, identity.requires.app))
    return { ok: false, reason: "newer", needs: identity.requires.app }
  const parsed = ComponentManifestSchema.safeParse(raw)
  if (!parsed.success)
    return invalid(
      "The component does not match the format.",
      parsed.error.issues.map((i) => ({
        path: i.path.map(safeSegment).join("."),
        message: i.message,
      }))
    )
  if (!trusted && RESERVED_NAMESPACES.has(namespaceOf(parsed.data.identity.id)))
    return invalid(
      `The namespace "${namespaceOf(parsed.data.identity.id)}" is reserved for signed catalogs.`
    )
  return { ok: true, manifest: parsed.data }
}

/** Reads `component.json` bytes: size, UTF-8, shape and keys first, then `checkManifest`. */
export function readManifest(
  bytes: Uint8Array,
  appVersion: string,
  trusted = false
): ReadManifestResult {
  if (bytes.byteLength > MANIFEST_LIMITS.maxBytes) return invalid("component.json is too large.")
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return invalid("component.json is not valid UTF-8 text.")
  }
  const shape = jsonTextShape(text, MANIFEST_LIMITS)
  if (shape.depth > MANIFEST_LIMITS.maxDepth || shape.values > MANIFEST_LIMITS.maxValues)
    return invalid("component.json is too deep or too large.")
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return invalid("component.json is not valid JSON.")
  }
  const scan = scanJsonValue(raw, MANIFEST_LIMITS)
  if (scan) return invalid("component.json holds data this app does not accept.", [scan])
  return checkManifest(raw, appVersion, trusted)
}
