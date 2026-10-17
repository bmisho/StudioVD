import { SCENE_LIMITS } from "./caps"

/** A problem in an opened document, at a dotted JSON path (`parts.<id>.assetId`). */
export interface DocumentProblem {
  path: string
  message: string
}

export interface ScanLimits {
  maxDepth: number
  maxValues: number
  maxString: number
}

/**
 * Prototype names are refused as keys anywhere: zod records silently drop `__proto__`, and a
 * lookup without `Object.hasOwn` would find `constructor` on every object.
 */
const RESERVED_KEYS = new Set(["__proto__", "constructor", "prototype"])

const [QUOTE, BACKSLASH, COMMA, COLON] = [0x22, 0x5c, 0x2c, 0x3a]
const [OPEN_OBJECT, CLOSE_OBJECT, OPEN_ARRAY, CLOSE_ARRAY] = [0x7b, 0x7d, 0x5b, 0x5d]
const isSpace = (c: number) => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d

/**
 * Nesting depth and number of values (keys are not values) of JSON text, counted before
 * `JSON.parse` builds anything: a 64 MiB `[0,0,...]` is 32M values, which would take minutes
 * and gigabytes to parse and walk. Linear and non-recursive (`JSON.parse`'s own depth limit
 * differs between engines); stops once a limit is passed, so the counts are then partial.
 * Exact for valid JSON; anything else fails `JSON.parse` afterwards.
 */
export function jsonTextShape(
  text: string,
  limits: Pick<ScanLimits, "maxDepth" | "maxValues"> = SCENE_LIMITS
): { depth: number; values: number } {
  const objects: boolean[] = [] // per open container: is it an object?
  let depth = 0
  let values = 0
  let expectKey = false // the next string is an object key
  let inScalar = false // inside a number, true, false or null
  for (let i = 0; i < text.length && depth <= limits.maxDepth && values <= limits.maxValues; i++) {
    const c = text.charCodeAt(i)
    if (c === QUOTE) {
      for (i++; i < text.length && text.charCodeAt(i) !== QUOTE; i++)
        if (text.charCodeAt(i) === BACKSLASH) i++ // skip the escaped character
      if (!expectKey) values++
      expectKey = inScalar = false
    } else if (c === OPEN_OBJECT || c === OPEN_ARRAY) {
      values++
      objects.push(c === OPEN_OBJECT)
      depth = Math.max(depth, objects.length)
      expectKey = c === OPEN_OBJECT
      inScalar = false
    } else if (c === CLOSE_OBJECT || c === CLOSE_ARRAY) {
      objects.pop()
      expectKey = inScalar = false
    } else if (c === COMMA) {
      expectKey = objects[objects.length - 1] === true
      inScalar = false
    } else if (c === COLON || isSpace(c)) inScalar = false
    else if (!inScalar) {
      values++
      inScalar = true
    }
  }
  return { depth, values }
}

interface Frame {
  value: unknown
  depth: number
  parent: Frame | null
  key: string | number
}

const pathOf = (frame: Frame): string => {
  const keys: string[] = []
  for (let f: Frame | null = frame; f?.parent; f = f.parent) keys.push(String(f.key))
  return keys.reverse().join(".")
}

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/
const INVALID = "<invalid key>"

/**
 * A problem from an untrusted file, safe to show: a path segment that is not a plain name,
 * id or index (a hostile key with newlines, bidi controls or a paragraph of text) shows as
 * `<invalid key>`, and the message is printable and short.
 */
export const shownProblem = (p: DocumentProblem): DocumentProblem => ({
  path: p.path
    .split(".")
    .map((s) => (s === "" || SAFE_SEGMENT.test(s) ? s : INVALID))
    .filter((s, i, all) => s !== INVALID || all[i - 1] !== INVALID) // a key with dots in it
    .join("."),
  message: p.message.replace(/[^\x20-\x7e]/g, "?").slice(0, 200),
})

/**
 * Checks a parsed JSON value before any schema sees it (PLAN 5.1): reserved keys, nesting,
 * non-finite numbers (`1e400` parses as Infinity), oversized strings and value counts.
 * Iterative, so hostile nesting cannot overflow the stack. Returns the first problem.
 */
export function scanJsonValue(
  root: unknown,
  limits: ScanLimits = SCENE_LIMITS
): DocumentProblem | null {
  const stack: Frame[] = [{ value: root, depth: 0, parent: null, key: "" }]
  let count = 0
  const fail = (frame: Frame, message: string) => ({ path: pathOf(frame), message })
  for (let frame = stack.pop(); frame; frame = stack.pop()) {
    if (++count > limits.maxValues) return fail(frame, "the file holds too many values")
    const value = frame.value
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return fail(frame, "number out of range")
    } else if (typeof value === "string") {
      if (value.length > limits.maxString) return fail(frame, "text too long")
    } else if (typeof value === "object" && value !== null) {
      const depth = frame.depth + 1
      if (depth > limits.maxDepth) return fail(frame, "nested too deeply")
      if (Array.isArray(value)) {
        // By index: Object.entries would build a pair and an index string per element.
        if (count + stack.length + value.length > limits.maxValues)
          return fail(frame, "the file holds too many values")
        for (let i = 0; i < value.length; i++)
          stack.push({ value: value[i] as unknown, depth, parent: frame, key: i })
        continue
      }
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        const next = { value: child, depth, parent: frame, key }
        if (RESERVED_KEYS.has(key)) return fail(next, `reserved key "${key}"`)
        if (key.length > limits.maxString) return fail(frame, "key too long")
        stack.push(next)
      }
    }
  }
  return null
}
