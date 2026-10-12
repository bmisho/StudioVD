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

/**
 * Deepest `{`/`[` nesting in JSON text, outside strings. Linear and non-recursive, so it runs
 * before `JSON.parse`, whose own depth limit differs between engines (V8, JavaScriptCore).
 */
export function jsonTextDepth(text: string): number {
  let depth = 0
  let max = 0
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (inString) {
      if (c === 0x5c)
        i++ // backslash: skip the escaped character
      else if (c === 0x22) inString = false
    } else if (c === 0x22) inString = true
    else if (c === 0x7b || c === 0x5b) max = Math.max(max, ++depth)
    else if (c === 0x7d || c === 0x5d) depth--
  }
  return max
}

interface Frame {
  value: unknown
  depth: number
  parent: Frame | null
  key: string
}

const pathOf = (frame: Frame): string => {
  const keys: string[] = []
  for (let f: Frame | null = frame; f?.parent; f = f.parent) keys.push(f.key)
  return keys.reverse().join(".")
}

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
