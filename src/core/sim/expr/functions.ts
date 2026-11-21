// The only functions behaviour can call (PLAN 11.5): pure maths, by name, from this table.

type Fn = { arity: number | [number, number]; apply: (args: number[]) => number }

const unary = (f: (x: number) => number): Fn => ({ arity: 1, apply: ([x = NaN]) => f(x) })

export const FUNCTIONS: ReadonlyMap<string, Fn> = new Map<string, Fn>([
  ["abs", unary(Math.abs)],
  ["sqrt", unary(Math.sqrt)],
  ["exp", unary(Math.exp)],
  ["ln", unary(Math.log)],
  ["log10", unary(Math.log10)],
  ["sin", unary(Math.sin)],
  ["cos", unary(Math.cos)],
  ["tan", unary(Math.tan)],
  ["asin", unary(Math.asin)],
  ["acos", unary(Math.acos)],
  ["atan", unary(Math.atan)],
  ["floor", unary(Math.floor)],
  ["ceil", unary(Math.ceil)],
  ["round", unary(Math.round)],
  ["sign", unary(Math.sign)],
  ["atan2", { arity: 2, apply: ([y = NaN, x = NaN]) => Math.atan2(y, x) }],
  ["pow", { arity: 2, apply: ([x = NaN, y = NaN]) => x ** y }],
  ["min", { arity: [2, 8], apply: (a) => Math.min(...a) }],
  ["max", { arity: [2, 8], apply: (a) => Math.max(...a) }],
  ["hypot", { arity: [2, 8], apply: (a) => Math.hypot(...a) }],
  ["clamp", { arity: 3, apply: ([x = NaN, lo = NaN, hi = NaN]) => Math.min(hi, Math.max(lo, x)) }],
  // Arduino's map(): a linear map from one range onto another.
  [
    "map",
    {
      arity: 5,
      apply: ([x = NaN, a = NaN, b = NaN, c = NaN, d = NaN]) => c + ((x - a) * (d - c)) / (b - a),
    },
  ],
])

/** Named constants a program can read. */
export const CONSTANTS: ReadonlyMap<string, number> = new Map([
  ["PI", Math.PI],
  ["E", Math.E],
])
