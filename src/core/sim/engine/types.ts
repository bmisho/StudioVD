import type { Medium, NodeId, ParamValue } from "@/core/schema"

// The simulation component interface (PLAN 12.1). Conserved ports carry an effort (V, rad/s,
// m/s, Pa) shared by their net and a flow (A, N·m, N, kg/s) summing to zero at it; signal
// ports carry values from an output to inputs. Units are SI throughout.

/** A signal value: a number (duty, pulse width, ADC counts, cd, lx...), a bool or text. */
export type SignalValue = number | boolean | string

/** An unknown of the conserved system a model refers to: a port's effort or a branch flow. */
export type Var = { port: string } | { branch: number }

/** Builds the Newton system at the current iterate (residuals and their derivatives). */
export interface Stamper {
  /** The effort of a port's net now (0 for a reference net). */
  e: (port: string) => number
  /** One of the instance's own branch unknowns now. */
  x: (branch: number) => number
  /**
   * Adds `value` to what flows out of the port's net into this block, with its partial
   * derivatives. KCL: the flows out of a net sum to zero.
   */
  flow: (port: string, value: number, d: readonly (readonly [Var, number])[]) => void
  /** The residual of the instance's own equation `branch` (the extra unknown's row). */
  equation: (branch: number, value: number, d: readonly (readonly [Var, number])[]) => void
}

/** Read access to a solved operating point (and to signal inputs while evaluating). */
export interface Reader {
  e: (port: string) => number
  /** The flow into this block at a conserved port. */
  flow: (port: string) => number
  x: (branch: number) => number
  /** The value on a signal input, or undefined when nothing drives it. */
  input: (port: string) => SignalValue | undefined
  /** A value this block's own evaluation set (an output, a program's `I_` flow). */
  own: (key: string) => SignalValue | undefined
}

export type Severity = "error" | "warning" | "info"

/** A problem said in words, mapped back to the blocks it concerns (PLAN 12.2). */
export interface Diagnostic {
  code: string
  severity: Severity
  message: string
  nodes: NodeId[]
}

/** One block as the solver sees it. */
export interface Instance {
  node: NodeId
  label: string
  /** Parameter values with the model's defaults filled in. */
  params: Readonly<Record<string, ParamValue>>
  /** Memory carried from one solve to the next (relay contacts, a stalled servo...). */
  state: Record<string, SignalValue>
  /** A parsed program, for boards and black boxes. */
  program?: unknown
  /** The medium at each fluid port (its circuit's). */
  media?: Readonly<Record<string, Medium>>
}

/** What a model does in the solver. Every member is optional. */
export interface Behaviour {
  /** How many extra unknowns (branch flows) the instance adds. */
  branches?: (c: Instance) => number
  /** Ports whose nets are their domain's reference (ground, frame, atmosphere). */
  grounds?: readonly string[]
  /** Conserved part: residuals and Jacobian at the current iterate. */
  stamp?: (s: Stamper, c: Instance, r: Reader) => void
  /** Signal outputs from the inputs and the conserved solution. */
  evaluate?: (c: Instance, r: Reader) => Record<string, SignalValue>
  /** After a converged solve: update `state` (hysteresis); true when it changed. */
  settle?: (c: Instance, r: Reader) => boolean
  /** Ratings, stalls and other findings on the final operating point. */
  check?: (c: Instance, r: Reader) => Omit<Diagnostic, "nodes">[]
}

/**
 * What bindings bring in from 3D (PLAN 13.1): parameter values by block, values on inputs by
 * `node/port`, and inputs fed by another block's output times a gain (light paths).
 */
export interface Injected {
  params: Record<string, Record<string, ParamValue>>
  signals: Record<string, number>
  light: Record<string, { from: string; gain: number }>
}

export const NOTHING_INJECTED: Injected = { params: {}, signals: {}, light: {} }

/** A number parameter (with its default already filled in). */
export const num = (c: Instance, key: string): number => {
  const v = c.params[key]
  return typeof v === "number" ? v : 0
}

/** A bool parameter. */
export const flag = (c: Instance, key: string): boolean => c.params[key] === true

/** A signal value as a number (true is 1; text and nothing are 0). */
export const asNumber = (v: SignalValue | undefined): number =>
  typeof v === "number" ? v : v === true ? 1 : 0

/** A signal value as a bool (numbers above one half are true). */
export const asBool = (v: SignalValue | undefined): boolean =>
  typeof v === "boolean" ? v : typeof v === "number" ? v > 0.5 : false
