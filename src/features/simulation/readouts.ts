import type { Domain, Port, SceneDocument } from "@/core/schema"
import { CONSERVED_DOMAINS } from "@/core/schema/schematic"
import type { SimResult } from "@/core/sim/engine/results"
import { DOMAIN_UNITS, quantity, signalText } from "@/core/sim/format"
import { portOf } from "@/core/sim/connections"

// What the schematic shows of a solve (PLAN 12.9), as small primitives so that components
// subscribed to them re-render only when the text they show changes.

/** Blocks that show a value in their body: the signal and its unit. */
const READOUT: Readonly<Record<string, readonly [string, string]>> = {
  "data.probe": ["value", ""],
  "data.display": ["value", ""],
  "data.analogInput": ["counts", ""],
  "electrical.voltmeter": ["reading", "V"],
  "electrical.ammeter": ["reading", "A"],
  "electrical.led": ["light", "cd"],
  "light.sensor": ["reading", "lx"],
  "mechanical.spring": ["deflection", "m"],
}

export function readout(result: SimResult | null, node: string, simModel: string | undefined) {
  const id = simModel?.split("@")[0] ?? ""
  const spec = Object.hasOwn(READOUT, id) ? READOUT[id] : undefined
  if (!result || !spec) return null
  return signalText(result.signals[`${node}/${spec[0]}`], spec[1])
}

/** A port's operating point: effort and flow, or the signal on it. */
export function portText(result: SimResult | null, node: string, port: Port): string | null {
  if (!result) return null
  const id = `${node}/${port.key}`
  if (CONSERVED_DOMAINS.has(port.domain)) {
    const p = result.ports[id]
    if (!p) return null
    const [e, f] = DOMAIN_UNITS[port.domain]
    return `${quantity(p.effort, e)}, ${quantity(p.flow, f)} in`
  }
  const v = result.signals[id]
  return v === undefined ? null : signalText(v, port.unit)
}

/** The largest flow out of a source port per domain: what wire animation speeds scale to. */
export function flowScales(doc: Pick<SceneDocument, "schematic">, result: SimResult) {
  const out: Partial<Record<Domain, number>> = {}
  for (const e of Object.values(doc.schematic.edges)) {
    const port = portOf(doc, { node: e.source, port: e.sourcePort })
    const f = result.ports[`${e.source}/${e.sourcePort}`]?.flow
    if (!port || f === undefined || !CONSERVED_DOMAINS.has(port.domain)) continue
    out[port.domain] = Math.max(out[port.domain] ?? 0, Math.abs(f))
  }
  return out
}

/**
 * How fast a wire's flow animates: −3…3, its sign the direction (positive: source → target).
 * The flow is what leaves the source block's port, exact for a wire between two ports.
 */
export function wireLevel(
  result: SimResult | null,
  scales: Partial<Record<Domain, number>>,
  edge: { source: string; sourcePort: string },
  domain: Domain
): number {
  const f = result?.ports[`${edge.source}/${edge.sourcePort}`]?.flow
  const max = scales[domain] ?? 0
  if (f === undefined || max <= 1e-12 || Math.abs(f) < 1e-3 * max) return 0
  return -Math.sign(f) * Math.max(1, Math.round(3 * Math.sqrt(Math.abs(f) / max)))
}
