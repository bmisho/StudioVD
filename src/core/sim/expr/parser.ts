import {
  EXPR_LIMITS,
  RESERVED_NAMES,
  type Assignment,
  type BinaryOp,
  type Expr,
  type Program,
} from "./ast"
import { CONSTANTS, FUNCTIONS } from "./functions"
import { ExprError, tokenize, type Token } from "./lexer"

const LEVELS: readonly (readonly BinaryOp[])[] = [
  ["||"],
  ["&&"],
  ["==", "!=", "<", "<=", ">", ">="],
  ["+", "-"],
  ["*", "/", "%"],
]

/**
 * Parses black-box behaviour (PLAN 11.5): `name = expression` statements, one per line (or
 * `;`), `#` comments. Refuses, with the line and column, anything over the limits (source
 * length, tree size, nesting), unknown functions, reserved names (`__proto__`...) and any
 * syntax it does not know: there is no member access, no strings and no way to call code.
 */
export function parseProgram(source: string): Program {
  if (source.length > EXPR_LIMITS.maxChars)
    throw new ExprError(`behaviour is longer than ${EXPR_LIMITS.maxChars} characters`, 1, 1)
  const tokens = tokenize(source)
  let at = 0
  let nodes = 0
  const peek = (): Token => tokens[at] ?? { kind: "end", text: "", line: 1, column: 1 }
  const next = (): Token => tokens[at++] ?? peek()
  const fail = (message: string, t: Token = peek()): never => {
    throw new ExprError(message, t.line, t.column)
  }
  const expect = (text: string) => {
    const t = next()
    if (t.text !== text)
      fail(t.kind === "end" ? `expected "${text}"` : `expected "${text}", not "${t.text}"`, t)
  }
  const node = <T extends Expr>(e: T): T => {
    if (++nodes > EXPR_LIMITS.maxNodes) fail(`more than ${EXPR_LIMITS.maxNodes} terms`)
    return e
  }
  const checkName = (t: Token) => {
    if (RESERVED_NAMES.has(t.text)) fail(`"${t.text}" cannot be a name`, t)
  }

  const expression = (depth: number): Expr => {
    if (depth > EXPR_LIMITS.maxDepth) fail(`nested deeper than ${EXPR_LIMITS.maxDepth}`)
    const test = binary(0, depth)
    if (peek().text !== "?") return test
    next()
    const then = expression(depth + 1)
    expect(":")
    return node({ kind: "ternary", test, then, otherwise: expression(depth + 1) })
  }
  const binary = (level: number, depth: number): Expr => {
    const ops = LEVELS[level]
    if (!ops) return unary(depth)
    let left = binary(level + 1, depth)
    while (ops.includes(peek().text as BinaryOp)) {
      const op = next().text as BinaryOp
      left = node({ kind: "binary", op, left, right: binary(level + 1, depth) })
    }
    return left
  }
  const unary = (depth: number): Expr => {
    if (depth > EXPR_LIMITS.maxDepth) fail(`nested deeper than ${EXPR_LIMITS.maxDepth}`)
    const t = peek()
    if (t.text === "-" || t.text === "!" || t.text === "+") {
      next()
      return node({ kind: "unary", op: t.text, arg: unary(depth + 1) })
    }
    const base = primary(depth)
    if (peek().text !== "^") return base
    next()
    return node({ kind: "binary", op: "^", left: base, right: unary(depth + 1) }) // right-assoc
  }
  const primary = (depth: number): Expr => {
    const t = next()
    if (t.kind === "number") {
      const value = Number(t.text)
      if (!Number.isFinite(value)) fail("that number is too large", t)
      return node({ kind: "number", value })
    }
    if (t.text === "true" || t.text === "false")
      return node({ kind: "bool", value: t.text === "true" })
    if (t.text === "(") {
      const inner = expression(depth + 1)
      expect(")")
      return inner
    }
    if (t.kind !== "name")
      return fail(t.kind === "end" ? "expected a value" : `unexpected "${t.text}"`, t)
    checkName(t)
    if (peek().text !== "(")
      return node({ kind: "name", name: t.text, line: t.line, column: t.column })
    const fn = FUNCTIONS.get(t.text)
    if (!fn) fail(`"${t.text}" is not a function (${[...FUNCTIONS.keys()].join(", ")})`, t)
    next()
    const args: Expr[] = []
    if (peek().text !== ")")
      do args.push(expression(depth + 1))
      while (peek().text === "," && next())
    expect(")")
    const [lo, hi] = typeof fn?.arity === "number" ? [fn.arity, fn.arity] : (fn?.arity ?? [0, 0])
    if (args.length < lo || args.length > hi)
      fail(`${t.text} takes ${lo === hi ? lo : `${lo} to ${hi}`} values`, t)
    return node({ kind: "call", name: t.text, args, line: t.line, column: t.column })
  }

  const statements: Assignment[] = []
  for (;;) {
    while (peek().kind === "newline" || peek().text === ";") next()
    if (peek().kind === "end") break
    const target = next()
    if (target.kind !== "name") fail("a line starts with the name it sets", target)
    checkName(target)
    if (CONSTANTS.has(target.text) || FUNCTIONS.has(target.text))
      fail(`"${target.text}" is built in`, target)
    expect("=")
    statements.push({
      target: target.text,
      value: expression(0),
      line: target.line,
      column: target.column,
    })
    if (statements.length > EXPR_LIMITS.maxStatements)
      fail(`more than ${EXPR_LIMITS.maxStatements} lines`, target)
    const end = peek()
    if (end.kind !== "newline" && end.kind !== "end" && end.text !== ";")
      fail(`unexpected "${end.text}"`, end)
  }
  return { statements }
}
