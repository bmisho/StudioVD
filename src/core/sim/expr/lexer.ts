// Tokens of the black-box behaviour language (PLAN 11.5). Hand-written: numbers, names,
// operators, newlines; no strings, no member access, nothing that could reach the host.

export type TokenKind = "number" | "name" | "op" | "newline" | "end"

export interface Token {
  kind: TokenKind
  text: string
  /** 1-based, for messages. */
  line: number
  column: number
}

export class ExprError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly column: number
  ) {
    super(`Line ${line}, column ${column}: ${message}`)
  }
}

const OPERATORS = [
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "+",
  "-",
  "*",
  "/",
  "%",
  "^",
  "<",
  ">",
  "!",
  "?",
  ":",
  "(",
  ")",
  ",",
  "=",
  ";",
]
const NAME = /[A-Za-z_][A-Za-z0-9_]*/y
const NUMBER = /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y

export function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let [i, line, start] = [0, 1, 0]
  const at = (): [number, number] => [line, i - start + 1]
  while (i < source.length) {
    const c = source[i] ?? ""
    if (c === "#") {
      while (i < source.length && source[i] !== "\n") i++
      continue
    }
    if (c === "\n") {
      tokens.push({ kind: "newline", text: "\n", line, column: i - start + 1 })
      i++
      line++
      start = i
      continue
    }
    if (c === " " || c === "\t" || c === "\r") {
      i++
      continue
    }
    const [l, col] = at()
    NUMBER.lastIndex = i
    const num = NUMBER.exec(source)
    if (num && /[\d.]/.test(c)) {
      tokens.push({ kind: "number", text: num[0], line: l, column: col })
      i += num[0].length
      continue
    }
    NAME.lastIndex = i
    const name = NAME.exec(source)
    if (name) {
      if (name[0].length > 32) throw new ExprError("names are at most 32 characters", l, col)
      tokens.push({ kind: "name", text: name[0], line: l, column: col })
      i += name[0].length
      continue
    }
    const op = OPERATORS.find((o) => source.startsWith(o, i))
    if (!op) throw new ExprError(`unexpected "${c}"`, l, col)
    tokens.push({ kind: "op", text: op, line: l, column: col })
    i += op.length
  }
  tokens.push({ kind: "end", text: "", line, column: i - start + 1 })
  return tokens
}
