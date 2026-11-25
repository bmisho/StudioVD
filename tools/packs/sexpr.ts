// A small S-expression reader for KiCad files (`.kicad_mod`): lists, bare atoms and quoted
// strings with backslash escapes. Untrusted input: depth and size are capped.

export type SExpr = string | SExpr[]

const MAX_DEPTH = 64
const MAX_BYTES = 4 * 1024 * 1024

/** Parses one top-level expression; throws on anything malformed or oversized. */
export function parseSExpr(text: string): SExpr {
  if (text.length > MAX_BYTES) throw new Error("the file is too large")
  let i = 0
  const skip = () => {
    while (i < text.length && /\s/.test(text.charAt(i))) i++
  }
  const atom = (): string => {
    const start = i
    while (i < text.length && !/[\s()"]/.test(text.charAt(i))) i++
    if (i === start) throw new Error(`unexpected ${JSON.stringify(text.charAt(i))} at ${i}`)
    return text.slice(start, i)
  }
  const quoted = (): string => {
    let out = ""
    i++ // opening quote
    while (i < text.length && text.charAt(i) !== '"') {
      if (text.charAt(i) === "\\" && i + 1 < text.length) i++
      out += text.charAt(i++)
    }
    if (i >= text.length) throw new Error("unterminated string")
    i++ // closing quote
    return out
  }
  const value = (depth: number): SExpr => {
    skip()
    const c = text.charAt(i)
    if (c === "(") {
      if (depth >= MAX_DEPTH) throw new Error("too deeply nested")
      i++
      const list: SExpr[] = []
      for (;;) {
        skip()
        if (i >= text.length) throw new Error("unbalanced parentheses")
        if (text.charAt(i) === ")") {
          i++
          return list
        }
        list.push(value(depth + 1))
      }
    }
    if (c === '"') return quoted()
    if (c === ")") throw new Error(`unexpected ) at ${i}`)
    return atom()
  }
  const root = value(0)
  skip()
  if (i !== text.length) throw new Error("trailing data after the expression")
  return root
}

/** The lists directly under `list` whose head is `name`. */
export const children = (list: SExpr, name: string): SExpr[][] =>
  Array.isArray(list) ? list.filter((x): x is SExpr[] => Array.isArray(x) && x[0] === name) : []

/** The first such list, or undefined. */
export const child = (list: SExpr, name: string): SExpr[] | undefined => children(list, name)[0]

/** Atom `k` of a list as a finite number, or throws naming the field. */
export function num(list: SExpr[] | undefined, k: number, what: string): number {
  const v = list?.[k]
  const n = typeof v === "string" ? Number(v) : Number.NaN
  if (!Number.isFinite(n)) throw new Error(`${what} is not a number`)
  return n
}
