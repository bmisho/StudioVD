import { SCENE_LIMITS } from "./caps"
import { parseDocument, type SceneDocument } from "./document"
import { checkIntegrity } from "./integrity"
import { migrate, savedByOf } from "./migrate"
import { jsonTextShape, scanJsonValue, shownProblem, type DocumentProblem } from "./scanJson"

export type OpenSceneResult =
  | { ok: true; document: SceneDocument; fromVersion: number; warnings: string[] }
  | { ok: false; message: string; problems: DocumentProblem[] }

/** Problems name keys from the untrusted file: only a few, made safe to show. */
const fail = (message: string, problems: DocumentProblem[] = []): OpenSceneResult => ({
  ok: false,
  message,
  problems: problems.slice(0, 20).map(shownProblem),
})

/** True when semver-like `a` is newer than `b` (numeric major.minor.patch, rest ignored). */
export function isNewerVersion(a: string, b: string): boolean {
  const parts = (v: string) => (v.match(/^(\d+)\.(\d+)\.(\d+)/) ?? []).slice(1).map(Number)
  const [x, y] = [parts(a), parts(b)]
  if (x.length !== 3 || y.length !== 3) return false
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
  return false
}

/**
 * Turns the bytes of an untrusted scene.json into a document (PLAN 5.1), or says why not:
 * size cap, strict UTF-8, nesting depth, JSON syntax, reserved keys and value limits, the
 * format version and migrations, the zod schema, then the integrity rules. Never throws.
 * A failing file is refused, never repaired: the next save would overwrite the original.
 */
export function openSceneBytes(bytes: Uint8Array, appVersion: string): OpenSceneResult {
  if (bytes.byteLength > SCENE_LIMITS.maxBytes) return fail("scene.json is too large.")
  let text: string
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return fail("scene.json is not valid UTF-8 text.")
  }
  const shape = jsonTextShape(text)
  if (shape.depth > SCENE_LIMITS.maxDepth) return fail("scene.json is nested too deeply.")
  if (shape.values > SCENE_LIMITS.maxValues) return fail("scene.json holds too many values.")
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return fail(`scene.json is not valid JSON (${e instanceof Error ? e.message : "syntax"}).`)
  }
  const scan = scanJsonValue(raw)
  if (scan) return fail("scene.json holds data this app does not accept.", [scan])

  const migrated = migrate(raw)
  if (!migrated.ok) return fail(migrated.message)
  const parsed = parseDocument(migrated.doc)
  if (!parsed.ok) {
    const savedBy = savedByOf(migrated.doc)
    const hint = isNewerVersion(savedBy, appVersion)
      ? ` It was saved by a newer StudioVD (${savedBy}); updating may help.`
      : ""
    return fail(`The project does not match the file format.${hint}`, parsed.issues)
  }
  const problems = checkIntegrity(parsed.document)
  if (problems.length > 0) return fail("The project's contents are inconsistent.", problems)
  return {
    ok: true,
    document: parsed.document,
    fromVersion: migrated.fromVersion,
    warnings: migrated.warnings,
  }
}

export type SerializeResult =
  { ok: true; json: string; document: SceneDocument } | { ok: false; problems: DocumentProblem[] }

/**
 * The scene.json text for `doc`, stamped with the app version. Runs the same schema and
 * integrity checks as opening, so the app never writes a file it would refuse to open.
 */
export function serializeScene(doc: SceneDocument, appVersion: string): SerializeResult {
  const stamped: SceneDocument = { ...doc, appVersion }
  const parsed = parseDocument(stamped)
  if (!parsed.ok) return { ok: false, problems: parsed.issues }
  const problems = checkIntegrity(parsed.document)
  if (problems.length > 0) return { ok: false, problems }
  return { ok: true, json: JSON.stringify(parsed.document), document: parsed.document }
}
