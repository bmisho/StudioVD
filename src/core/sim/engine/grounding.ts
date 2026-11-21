import type { Domain, Medium, NodeId } from "@/core/schema"
import { DOMAIN_LOOK } from "@/core/schematic/domainLook"
import type { Block, Net } from "./netlist"
import type { Diagnostic } from "./types"

// Islands of nets a block joins in one domain (PLAN 12.2): an island needs a reference (a
// ground, a frame, the atmosphere) or its efforts are undefined; a fluid island has one medium.

function root(parent: number[], i: number): number {
  while (parent[i] !== i) i = parent[i] ?? i
  return i
}

const GROUND_HINT: Record<Domain, string> = {
  electrical: "add a Ground block",
  mechRotational: "add a Rotational frame block",
  mechTranslational: "add a Linear frame block",
  fluid: "add a Pressure source (its return is the atmosphere)",
  light: "",
  data: "",
}

export function groundingDiagnostics(
  nets: Net[],
  blocks: Block[],
  portMedia: readonly (Medium | undefined)[],
  index: ReadonlyMap<string, number>
): Diagnostic[] {
  const parent = nets.map((_, i) => i)
  for (const b of blocks) {
    const first = new Map<Domain, number>()
    for (const n of Object.values(b.nets)) {
      const d = nets[n]?.domain
      if (!d) continue
      const f = first.get(d)
      if (f === undefined) first.set(d, n)
      else parent[root(parent, n)] = root(parent, f)
    }
  }
  const islands = new Map<number, { nets: number[]; nodes: Set<NodeId> }>()
  nets.forEach((_, i) => {
    const r = root(parent, i)
    const island = islands.get(r) ?? { nets: [], nodes: new Set<NodeId>() }
    island.nets.push(i)
    islands.set(r, island)
  })
  for (const b of blocks)
    for (const n of Object.values(b.nets)) islands.get(root(parent, n))?.nodes.add(b.inst.node)

  const referenced = new Set(nets.filter((n) => n.reference).map((n) => n.domain))
  const missing = new Map<Domain, Set<NodeId>>()
  const out: Diagnostic[] = []
  for (const island of islands.values()) {
    const domain = nets[island.nets[0] ?? 0]?.domain ?? "electrical"
    const wired = island.nets.some((n) => (nets[n]?.ports.length ?? 0) > 1)
    const hasReference = island.nets.some((n) => nets[n]?.reference)
    if (wired && !hasReference) {
      if (!referenced.has(domain)) {
        const set = missing.get(domain) ?? new Set<NodeId>()
        for (const node of island.nodes) set.add(node)
        missing.set(domain, set)
      } else
        out.push({
          code: "floating",
          severity: "warning",
          message: `Not connected to the ${DOMAIN_LOOK[domain].name.toLowerCase()} reference: these efforts are undefined.`,
          nodes: [...island.nodes],
        })
    }
    if (domain === "fluid") {
      const found = new Set<Medium>()
      for (const n of island.nets)
        for (const id of nets[n]?.ports ?? []) {
          const m = portMedia[index.get(id) ?? -1]
          if (m) found.add(m)
        }
      for (const b of blocks) {
        const m = b.inst.params.medium
        const touches = Object.values(b.nets).some(
          (n) => root(parent, n) === root(parent, island.nets[0] ?? 0)
        )
        if (touches && (m === "air" || m === "water" || m === "oil")) found.add(m)
      }
      if (found.size > 1)
        out.push({
          code: "medium-mismatch",
          severity: "error",
          message: `One fluid circuit holds ${[...found].join(" and ")}: pumps, fans and sources must agree.`,
          nodes: [...island.nodes],
        })
      const medium: Medium = [...found][0] ?? "air"
      for (const n of island.nets) {
        const net = nets[n]
        if (net) net.medium = medium
      }
    }
  }
  for (const [domain, nodes] of missing)
    out.push({
      code: "missing-ground",
      severity: "error",
      message: `The ${DOMAIN_LOOK[domain].name.toLowerCase()} circuit has no reference: ${GROUND_HINT[domain]}.`,
      nodes: [...nodes],
    })
  return out
}
