import type { BlockDef, Domain } from "@/core/schema"
import { CONSERVED_DOMAINS } from "@/core/schema/schematic"
import type { Program } from "../../expr/ast"
import { runProgram, type Value } from "../../expr/evaluate"
import { ExprError } from "../../expr/lexer"
import { parseProgram } from "../../expr/parser"
import { asNumber, type Behaviour, type Diagnostic } from "../types"

// Boards and black boxes (PLAN 11.5): their program runs as a signal block. It reads its
// inputs (a terminal reads its effort: volts, rad/s...) and parameters, and sets its outputs.
// Setting `I_<terminal>` makes the block take that flow at the terminal; it comes back out
// through the last terminal of the same domain the program leaves alone (GND, usually).

const parsed = new WeakMap<BlockDef, Program | ExprError>()

function programOf(def: BlockDef): Program | ExprError {
  let p = parsed.get(def)
  if (!p) {
    try {
      p = parseProgram(def.behaviour ?? "")
    } catch (e) {
      if (!(e instanceof ExprError)) throw e
      p = e
    }
    parsed.set(def, p)
  }
  return p
}

const problem = (message: string): Omit<Diagnostic, "nodes"> => ({
  code: "program",
  severity: "error",
  message,
})

export function programBehaviour(def: BlockDef): Behaviour {
  const terminals = def.ports.filter((p) => CONSERVED_DOMAINS.has(p.domain))
  const inputs = def.ports.filter((p) => p.direction === "in")
  const outputs = new Set(def.ports.filter((p) => p.direction === "out").map((p) => p.key))
  return {
    evaluate: (c, r) => {
      const program = programOf(def)
      if (program instanceof ExprError) return {}
      const values = new Map<string, Value>()
      for (const [key, v] of Object.entries(c.params))
        if (typeof v === "number" || typeof v === "boolean") values.set(key, v)
      for (const p of inputs) {
        const v = r.input(p.key)
        values.set(p.key, typeof v === "boolean" ? v : asNumber(v))
      }
      for (const t of terminals) values.set(t.key, r.e(t.key))
      try {
        const set = runProgram(program, values)
        delete c.state.error
        const out: Record<string, Value> = {}
        for (const [key, v] of set)
          if (
            outputs.has(key) ||
            (key.startsWith("I_") && terminals.some((t) => `I_${t.key}` === key))
          )
            out[key] = v
        return out
      } catch (e) {
        if (!(e instanceof ExprError)) throw e
        c.state.error = e.message
        return {}
      }
    },
    stamp: (s, _c, r) => {
      const byDomain = new Map<Domain, string[]>()
      for (const t of terminals) byDomain.set(t.domain, [...(byDomain.get(t.domain) ?? []), t.key])
      for (const keys of byDomain.values()) {
        let sum = 0
        const free: string[] = []
        for (const key of keys) {
          const v = r.own(`I_${key}`)
          if (v === undefined) free.push(key)
          else {
            s.flow(key, asNumber(v), [])
            sum += asNumber(v)
          }
        }
        const back = free.at(-1) ?? keys.at(-1)
        if (back !== undefined && sum !== 0) s.flow(back, -sum, [])
      }
    },
    check: (c) => {
      const program = programOf(def)
      if (program instanceof ExprError) return [problem(`${c.label}: ${program.message}`)]
      return typeof c.state.error === "string" ? [problem(`${c.label}: ${c.state.error}`)] : []
    },
  }
}
