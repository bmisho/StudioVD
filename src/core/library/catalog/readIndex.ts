import { CatalogIndexSchema, type CatalogIndex } from "@/core/schema"
import { jsonTextShape, scanJsonValue, type ScanLimits } from "@/core/schema/scanJson"
import { safeSegment } from "@/core/schema/shown"

/** The index is at most 16 MiB (checked in Rust first) and flat: 50 000 components × ~40 values. */
const INDEX_LIMITS: ScanLimits = { maxDepth: 12, maxValues: 4_000_000, maxString: 8192 }

export type ReadIndex = { ok: true; index: CatalogIndex } | { ok: false; message: string }

/**
 * The cached catalog index as the webview reads it (PLAN 4.4): Rust verified its signature;
 * here it goes through the same bounded parse and strict schema as every untrusted file.
 */
export function readCatalogIndex(text: string): ReadIndex {
  const shape = jsonTextShape(text, INDEX_LIMITS)
  if (shape.depth > INDEX_LIMITS.maxDepth || shape.values > INDEX_LIMITS.maxValues)
    return { ok: false, message: "The catalog index is too large." }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, message: "The catalog index is not JSON." }
  }
  const scan = scanJsonValue(raw, INDEX_LIMITS)
  if (scan)
    return { ok: false, message: `The catalog index is refused: ${scan.message} (${scan.path}).` }
  const parsed = CatalogIndexSchema.safeParse(raw)
  if (parsed.success) return { ok: true, index: parsed.data }
  const issue = parsed.error.issues[0]
  const at = issue ? issue.path.map(safeSegment).join(".") : ""
  return { ok: false, message: `The catalog index is not valid (${at}: ${issue?.message ?? "?"}).` }
}
