import type { Expr, Program } from "./ast"
import { CONSTANTS, FUNCTIONS } from "./functions"
import { ExprError } from "./lexer"

export type Value = number | boolean

const num = (v: Value): number => (typeof v === "boolean" ? (v ? 1 : 0) : v)
const truthy = (v: Value): boolean => (typeof v === "boolean" ? v : v !== 0 && !Number.isNaN(v))

/**
 * Runs a program over `inputs` (port and parameter values by name): each line sets its name,
 * later lines see earlier results. Values live in a Map, never on an object, so no name can
 * reach a prototype. Returns every name a line set. An unknown name, or a result that is not
 * a finite number, is an error with its line.
 */
export function runProgram(
  program: Program,
  inputs: ReadonlyMap<string, Value>
): Map<string, Value> {
  const vars = new Map<string, Value>(inputs)
  const set = new Map<string, Value>()
  const read = (name: string, line: number, column: number): Value => {
    const v = vars.get(name) ?? CONSTANTS.get(name)
    if (v === undefined)
      throw new ExprError(`"${name}" is not an input, a parameter or an earlier line`, line, column)
    return v
  }
  const evaluate = (e: Expr): Value => {
    switch (e.kind) {
      case "number":
      case "bool":
        return e.value
      case "name":
        return read(e.name, e.line, e.column)
      case "unary": {
        const v = evaluate(e.arg)
        return e.op === "!" ? !truthy(v) : e.op === "-" ? -num(v) : num(v)
      }
      case "ternary":
        return truthy(evaluate(e.test)) ? evaluate(e.then) : evaluate(e.otherwise)
      case "call": {
        const fn = FUNCTIONS.get(e.name)
        if (!fn) throw new ExprError(`"${e.name}" is not a function`, e.line, e.column)
        return fn.apply(e.args.map((a) => num(evaluate(a))))
      }
      case "binary": {
        if (e.op === "&&") return truthy(evaluate(e.left)) && truthy(evaluate(e.right))
        if (e.op === "||") return truthy(evaluate(e.left)) || truthy(evaluate(e.right))
        const [a, b] = [num(evaluate(e.left)), num(evaluate(e.right))]
        switch (e.op) {
          case "+":
            return a + b
          case "-":
            return a - b
          case "*":
            return a * b
          case "/":
            return a / b
          case "%":
            return a % b
          case "^":
            return a ** b
          case "==":
            return a === b
          case "!=":
            return a !== b
          case "<":
            return a < b
          case "<=":
            return a <= b
          case ">":
            return a > b
          case ">=":
            return a >= b
        }
      }
    }
  }
  for (const s of program.statements) {
    const v = evaluate(s.value)
    if (typeof v === "number" && !Number.isFinite(v))
      throw new ExprError(`${s.target} is not a finite number`, s.line, s.column)
    vars.set(s.target, v)
    set.set(s.target, v)
  }
  return set
}

/** The names a program reads that it neither sets earlier nor finds in `known`. */
export function unknownNames(program: Program, known: ReadonlySet<string>): string[] {
  const defined = new Set(known)
  const missing = new Set<string>()
  const walk = (e: Expr): void => {
    if (e.kind === "name" && !defined.has(e.name) && !CONSTANTS.has(e.name)) missing.add(e.name)
    for (const child of children(e)) walk(child)
  }
  for (const s of program.statements) {
    walk(s.value)
    defined.add(s.target)
  }
  return [...missing]
}

function children(e: Expr): Expr[] {
  switch (e.kind) {
    case "unary":
      return [e.arg]
    case "binary":
      return [e.left, e.right]
    case "ternary":
      return [e.test, e.then, e.otherwise]
    case "call":
      return e.args
    default:
      return []
  }
}
