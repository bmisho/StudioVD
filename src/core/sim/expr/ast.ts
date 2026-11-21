/** The behaviour language's syntax tree (PLAN 11.5): numbers, booleans, names, operators, calls. */
export type Expr =
  | { kind: "number"; value: number }
  | { kind: "bool"; value: boolean }
  | { kind: "name"; name: string; line: number; column: number }
  | { kind: "unary"; op: "-" | "!" | "+"; arg: Expr }
  | { kind: "binary"; op: BinaryOp; left: Expr; right: Expr }
  | { kind: "ternary"; test: Expr; then: Expr; otherwise: Expr }
  | { kind: "call"; name: string; args: Expr[]; line: number; column: number }

export type BinaryOp =
  "+" | "-" | "*" | "/" | "%" | "^" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "&&" | "||"

/** `name = expression`. */
export interface Assignment {
  target: string
  value: Expr
  line: number
  column: number
}

export interface Program {
  statements: Assignment[]
}

/** Limits that keep a hostile file harmless (PLAN 11.5). */
export const EXPR_LIMITS = {
  maxChars: 2048,
  maxNodes: 512,
  maxDepth: 32,
  maxStatements: 64,
} as const

/** Names no variable may have: they are prototype members of a JS object. */
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
  "true",
  "false",
])
