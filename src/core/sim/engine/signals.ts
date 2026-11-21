import { portId, type Block, type Netlist } from "./netlist"
import type { Reader, SignalValue } from "./types"

// Signal propagation (PLAN 12.4): outputs to inputs in dependency order; blocks in a loop are
// evaluated again until their outputs stop changing, or reported.

/** Most passes over a loop before it is reported as not settling. */
const LOOP_PASSES = 50

export interface SignalPlan {
  /** Blocks that evaluate, drivers before what they drive. */
  order: Block[]
  /** Blocks on feedback loops (evaluated last, repeatedly). */
  loop: Block[]
}

/** Kahn's algorithm over "drives an input of" between evaluating blocks. */
export function planSignals(netlist: Netlist): SignalPlan {
  const evaluating = netlist.blocks.filter((b) => b.behaviour.evaluate)
  const byNode = new Map(evaluating.map((b) => [b.inst.node as string, b]))
  const waits = new Map<Block, number>()
  const feeds = new Map<Block, Block[]>()
  for (const b of evaluating) {
    const from = new Set<Block>()
    for (const driver of Object.values(b.drivers)) {
      const source = byNode.get(driver.slice(0, driver.indexOf("/")))
      // A block wired to itself is a loop of one: it waits on itself and never runs in order.
      if (source) from.add(source)
    }
    waits.set(b, from.size)
    for (const s of from) feeds.set(s, [...(feeds.get(s) ?? []), b])
  }
  const ready = evaluating.filter((b) => waits.get(b) === 0)
  const order: Block[] = []
  while (ready.length > 0) {
    const b = ready.shift()
    if (!b) break
    order.push(b)
    for (const next of feeds.get(b) ?? []) {
      const left = (waits.get(next) ?? 0) - 1
      waits.set(next, left)
      if (left === 0) ready.push(next)
    }
  }
  const placed = new Set(order)
  return { order, loop: evaluating.filter((b) => !placed.has(b)) }
}

const same = (a: SignalValue | undefined, b: SignalValue | undefined) =>
  a === b ||
  (typeof a === "number" &&
    typeof b === "number" &&
    Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a)))

/**
 * Evaluates every signal block once in order, then the loop until it settles. Writes outputs
 * into `values` (`node/port`); returns whether anything changed and the loop's blocks when it
 * did not settle.
 */
export function evaluateSignals(
  plan: SignalPlan,
  values: Map<string, SignalValue>,
  readerOf: (block: Block) => Reader
): { changed: boolean; unsettled: Block[] } {
  let changed = false
  const run = (b: Block) => {
    let moved = false
    const out = b.behaviour.evaluate?.(b.inst, readerOf(b)) ?? {}
    for (const [key, value] of Object.entries(out)) {
      const id = portId(b.inst.node, key)
      if (!same(values.get(id), value)) {
        values.set(id, value)
        moved = true
      }
    }
    changed ||= moved
    return moved
  }
  for (const b of plan.order) run(b)
  if (plan.loop.length === 0) return { changed, unsettled: [] }
  for (let pass = 0; pass < LOOP_PASSES; pass++) {
    let moved = false
    // Blocks downstream of a loop wait on it, so they are in `loop` too.
    for (const b of plan.loop) moved = run(b) || moved
    if (!moved) return { changed, unsettled: [] }
  }
  return { changed, unsettled: plan.loop }
}
