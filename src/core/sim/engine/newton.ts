import type { Domain } from "@/core/schema"
import { solveInPlace } from "./lu"
import type { Block, Netlist } from "./netlist"
import type { Reader, SignalValue, Stamper, Var } from "./types"

// Modified nodal analysis solved by Newton–Raphson (PLAN 12.3): every block adds its flows to
// its nets' rows (KCL) and its own equations; a small conductance to the reference on every
// net (`gmin`) keeps an open circuit solvable.

/** Per domain: gmin (flow per effort) — far below anything a real part conducts. */
const GMIN: Record<Domain, number> = {
  electrical: 1e-12,
  mechRotational: 1e-12,
  mechTranslational: 1e-12,
  fluid: 1e-15,
  light: 0,
  data: 0,
}

export interface Solution {
  x: Float64Array
  converged: boolean
  iterations: number
  /** A row with no usable pivot: the net or branch where the system is singular. */
  singularRow: number | null
  /** The largest residual left. */
  residual: number
}

export interface SolveSettings {
  maxIterations: number
  tolerance: number
}

/** How blocks reach signal values: their driven inputs and their own outputs. */
export interface Signals {
  input: (block: Block, port: string) => SignalValue | undefined
  own: (block: Block, key: string) => SignalValue | undefined
}

/**
 * A reader over the unknowns `x` for one block; `flows` (`node/port` → flow into the block)
 * once a solve is done.
 */
export function readerFor(
  netlist: Netlist,
  block: Block,
  x: Float64Array,
  signals: Signals,
  flows?: ReadonlyMap<string, number>
): Reader {
  const unknownOf = (port: string) => {
    const n = block.nets[port]
    return n === undefined ? -1 : (netlist.nets[n]?.unknown ?? -1)
  }
  return {
    e: (port) => {
      const u = unknownOf(port)
      return u < 0 ? 0 : (x[u] ?? 0)
    },
    x: (k) => x[block.firstBranch + k] ?? 0,
    flow: (port) => flows?.get(`${block.inst.node}/${port}`) ?? 0,
    input: (port) => signals.input(block, port),
    own: (key) => signals.own(block, key),
  }
}

/** Residuals f(x) and Jacobian J(x), or just the flows each block takes at each port. */
export function assemble(
  netlist: Netlist,
  x: Float64Array,
  signals: Signals,
  out: {
    f: Float64Array
    J?: Float64Array
    portFlow?: (block: Block, port: string, v: number) => void
  }
): void {
  const n = netlist.unknowns
  const { f, J } = out
  f.fill(0)
  J?.fill(0)
  for (const block of netlist.blocks) {
    const stamp = block.behaviour.stamp
    if (!stamp) continue
    const r = readerFor(netlist, block, x, signals)
    const unknownOf = (port: string) => {
      const k = block.nets[port]
      return k === undefined ? -1 : (netlist.nets[k]?.unknown ?? -1)
    }
    const col = (v: Var) => ("port" in v ? unknownOf(v.port) : block.firstBranch + v.branch)
    const add = (row: number, value: number, d: readonly (readonly [Var, number])[]) => {
      if (row < 0) return
      f[row] = (f[row] ?? 0) + value
      if (!J) return
      for (const [v, dv] of d) {
        const c = col(v)
        if (c >= 0) J[row * n + c] = (J[row * n + c] ?? 0) + dv
      }
    }
    const s: Stamper = {
      e: r.e,
      x: r.x,
      flow: (port, value, d) => {
        out.portFlow?.(block, port, value)
        add(unknownOf(port), value, d)
      },
      equation: (k, value, d) => add(block.firstBranch + k, value, d),
    }
    stamp(s, block.inst, r)
  }
  for (const net of netlist.nets) {
    if (net.unknown < 0) continue
    const g = GMIN[net.domain]
    f[net.unknown] = (f[net.unknown] ?? 0) + g * (x[net.unknown] ?? 0)
    if (J) J[net.unknown * n + net.unknown] = (J[net.unknown * n + net.unknown] ?? 0) + g
  }
}

const norm = (v: Float64Array) => v.reduce((m, y) => Math.max(m, Math.abs(y)), 0)

/** Newton–Raphson from `x0`, halving a step that makes the residual grow. */
export function solveConserved(
  netlist: Netlist,
  signals: Signals,
  settings: SolveSettings,
  x0?: Float64Array
): Solution {
  const n = netlist.unknowns
  const x = x0 && x0.length === n ? Float64Array.from(x0) : new Float64Array(n)
  const f = new Float64Array(n)
  const J = new Float64Array(n * n)
  if (n === 0) return { x, converged: true, iterations: 0, singularRow: null, residual: 0 }
  assemble(netlist, x, signals, { f, J })
  let residual = norm(f)
  for (let it = 1; it <= settings.maxIterations; it++) {
    const m = { n, a: J.slice() }
    const step = f.map((v) => -v)
    let singular = solveInPlace(m, step)
    // A near-singular system shows as a step beyond any physical value (1e15 V, rad/s, Pa...).
    if (singular < 0) {
      let worst = 0
      step.forEach((v, i) => {
        if (!Number.isFinite(v) || Math.abs(v) > Math.abs(step[worst] ?? 0)) worst = i
      })
      const w = step[worst] ?? 0
      if (!Number.isFinite(w) || Math.abs(w) > 1e15) singular = worst
    }
    if (singular >= 0)
      return { x, converged: false, iterations: it, singularRow: singular, residual }
    let scale = 1
    const trial = new Float64Array(n)
    for (let tries = 0; ; tries++) {
      for (let i = 0; i < n; i++) trial[i] = (x[i] ?? 0) + scale * (step[i] ?? 0)
      assemble(netlist, trial, signals, { f, J })
      const next = norm(f)
      if (next <= residual || tries >= 10 || !Number.isFinite(residual)) {
        residual = next
        break
      }
      scale /= 2
    }
    const moved = norm(step.map((v) => v * scale))
    x.set(trial)
    const size = Math.max(1, norm(x))
    if (residual <= settings.tolerance && moved <= 1e-9 * size)
      return { x, converged: true, iterations: it, singularRow: null, residual }
  }
  return {
    x,
    converged: residual <= settings.tolerance,
    iterations: settings.maxIterations,
    singularRow: null,
    residual,
  }
}
