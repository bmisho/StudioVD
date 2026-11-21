import type { BlockDef } from "@/core/schema"
import { unknownNames } from "./evaluate"
import { ExprError } from "./lexer"
import { parseProgram } from "./parser"

// What the black-box editor says about a behaviour while it is typed (PLAN 11.5).

export interface BehaviourCheck {
  /** The first syntax or limit error, with where it is. */
  error: { message: string; line: number; column: number } | null
  /** Names read that are not inputs, parameters, constants or set earlier. */
  unknown: string[]
  /** Outputs the program never sets. */
  unset: string[]
  /** Inputs or parameters the program tries to set. */
  readOnly: string[]
}

/** The names a block's program reads (inputs, terminals, parameters) and sets (outputs). */
export function behaviourNames(def: Pick<BlockDef, "ports" | "params">) {
  const inputs = def.ports.filter((p) => p.direction !== "out").map((p) => p.key)
  const outputs = def.ports.filter((p) => p.direction === "out").map((p) => p.key)
  return { inputs: [...inputs, ...def.params.map((p) => p.key)], outputs }
}

export function checkBehaviour(source: string, def: Pick<BlockDef, "ports" | "params">) {
  const { inputs, outputs } = behaviourNames(def)
  const result: BehaviourCheck = { error: null, unknown: [], unset: [], readOnly: [] }
  try {
    const program = parseProgram(source)
    const set = new Set(program.statements.map((s) => s.target))
    const fixed = new Set(inputs)
    result.unknown = unknownNames(program, fixed)
    result.unset = outputs.filter((o) => !set.has(o))
    result.readOnly = [...set].filter((name) => fixed.has(name))
  } catch (e) {
    if (!(e instanceof ExprError)) throw e
    result.error = { message: e.message, line: e.line, column: e.column }
  }
  return result
}
