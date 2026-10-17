import type { DocumentProblem } from "./scanJson"

// Problems from an untrusted file name its keys; the open error shows them to the user.

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/
const INVALID = "<invalid key>"

/**
 * A key or index from an untrusted file, safe to show: a plain name, id or index as is,
 * anything else (newlines, bidi controls, dots, a sentence) as `<invalid key>`. Judged one
 * key at a time, before a path is joined with dots.
 */
export const safeSegment = (key: PropertyKey): string =>
  typeof key === "number"
    ? String(key)
    : typeof key === "string" && SAFE_SEGMENT.test(key)
      ? key
      : INVALID

/**
 * A message safe to show: zod quotes keys back (`Unrecognized key: "..."`), so quoted text
 * that is not a plain name is replaced; then only short, printable ASCII is kept.
 */
export const safeMessage = (message: string): string =>
  message
    .replace(/"(?:[^"\\]|\\.)*"/g, (quoted) =>
      SAFE_SEGMENT.test(quoted.slice(1, -1)) ? quoted : `"${INVALID}"`
    )
    .replace(/[^\x20-\x7e]/g, "?")
    .slice(0, 200)

/** A problem safe to show (paths are built from `safeSegment`s; this catches any other). */
export const shownProblem = (p: DocumentProblem): DocumentProblem => ({
  path: p.path
    .split(".")
    .map((s) => (s === "" || s === INVALID ? s : safeSegment(s)))
    .join("."),
  message: safeMessage(p.message),
})
