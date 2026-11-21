import type { NodeId, Payload, Port, SceneDocument } from "@/core/schema"
import { CONSERVED_DOMAINS } from "@/core/schema/schematic"

type Schematic = Pick<SceneDocument, "schematic">

export interface PortRef {
  node: NodeId
  port: string
}

export type ConnectRefusal =
  | "missing" // a node or port is not in the document
  | "samePort" // a port to itself
  | "domain" // electrical to fluid, data to light...
  | "medium" // air to water
  | "direction" // two outputs, two inputs
  | "payload" // a bool output into a PWM input
  | "driven" // the input already has its driver
  | "duplicate" // these two ports are already wired
  | "full" // the schematic holds as many wires as a file may

export const CONNECT_TEXT: Record<ConnectRefusal, string> = {
  missing: "That port is gone",
  samePort: "A port cannot be wired to itself",
  domain: "Only ports of one domain connect",
  medium: "Fluid ports of different media do not connect",
  direction: "A signal goes from an output to an input",
  payload: "The output carries another kind of value than the input takes",
  driven: "That input already has a wire: one driver per input",
  duplicate: "These ports are already wired",
  full: "The schematic holds as many wires as a project may",
}

/** Whether a connect result is a refusal rather than a new wire's id. */
export const isRefusal = (result: string): result is ConnectRefusal =>
  Object.hasOwn(CONNECT_TEXT, result)

/** The port a reference names, if its node and block have it. */
export function portOf(doc: Schematic, ref: PortRef): Port | undefined {
  const { nodes, blockDefs } = doc.schematic
  const node = Object.hasOwn(nodes, ref.node) ? nodes[ref.node] : undefined
  const def =
    node && Object.hasOwn(blockDefs, node.blockDefId) ? blockDefs[node.blockDefId] : undefined
  return def?.ports.find((p) => p.key === ref.port)
}

/** Whether an output of `from` may drive an input that takes `to`. */
function payloadFits(from: Payload | undefined, to: Payload | undefined): boolean {
  if (!from || !to || from === to) return true
  if (to === "text") return true // a display shows anything
  // A board pin carries what its program writes; a servo reads it as a pulse width (s).
  if (to === "pulse" && from === "pwm") return true
  // A number input takes any numeric value; a PWM duty feeds a pulse input's driver logic.
  return to === "number" && from !== "bool" && from !== "text"
}

/**
 * Why two ports may not be wired (PLAN 11.4), or null: one domain, one fluid medium, signals
 * from an output to an input of a fitting payload, one driver per input, no wire twice.
 * Conserved terminals join freely: they share a net.
 */
export function connectionProblem(doc: Schematic, a: PortRef, b: PortRef): ConnectRefusal | null {
  const [pa, pb] = [portOf(doc, a), portOf(doc, b)]
  if (!pa || !pb) return "missing"
  if (a.node === b.node && a.port === b.port) return "samePort"
  if (pa.domain !== pb.domain) return "domain"
  if (pa.domain === "fluid" && pa.medium && pb.medium && pa.medium !== pb.medium) return "medium"
  const same = (e: { source: string; sourcePort: string; target: string; targetPort: string }) =>
    (e.source === a.node &&
      e.sourcePort === a.port &&
      e.target === b.node &&
      e.targetPort === b.port) ||
    (e.source === b.node &&
      e.sourcePort === b.port &&
      e.target === a.node &&
      e.targetPort === a.port)
  const edges = Object.values(doc.schematic.edges)
  if (edges.some(same)) return "duplicate"
  if (CONSERVED_DOMAINS.has(pa.domain)) return null
  const ordered = orderSignal(doc, a, b)
  if (!ordered) return "direction"
  const [from, to] = [portOf(doc, ordered.source), portOf(doc, ordered.target)]
  if (!payloadFits(from?.payload, to?.payload)) return "payload"
  const { target } = ordered
  if (edges.some((e) => e.target === target.node && e.targetPort === target.port)) return "driven"
  return null
}

/**
 * A wire's two ends in the order the file keeps them: a signal from its output to its input;
 * terminals as given. Null when two signal ports are both outputs or both inputs.
 */
export function orderSignal(
  doc: Schematic,
  a: PortRef,
  b: PortRef
): { source: PortRef; target: PortRef } | null {
  const [pa, pb] = [portOf(doc, a), portOf(doc, b)]
  if (!pa || !pb) return null
  if (pa.direction === "terminal" || pb.direction === "terminal") return { source: a, target: b }
  if (pa.direction === "out" && pb.direction === "in") return { source: a, target: b }
  if (pa.direction === "in" && pb.direction === "out") return { source: b, target: a }
  return null
}
