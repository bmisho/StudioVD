import type { SceneDocument } from "./document"

type Report = (path: string, message: string) => void

const has = (record: object, id: unknown): boolean =>
  typeof id === "string" && Object.hasOwn(record, id)

/**
 * The schematic's own references (PLAN 11): every wire names ports its blocks have (one
 * wire per port pair, never a port to itself), every node's parameter is one its block
 * defines, and a node linked to a component names one that points back.
 */
export function checkSchematicRefs(doc: SceneDocument, report: Report): void {
  const { nodes, edges, blockDefs } = doc.schematic
  const portsOf = (nodeId: string): Set<string> | null => {
    const node = has(nodes, nodeId) ? nodes[nodeId as keyof typeof nodes] : undefined
    const def = node && has(blockDefs, node.blockDefId) ? blockDefs[node.blockDefId] : undefined
    return def ? new Set(def.ports.map((p) => p.key)) : null
  }
  const pairs = new Set<string>()
  for (const [key, e] of Object.entries(edges)) {
    const [from, to] = [portsOf(e.source), portsOf(e.target)]
    if (from && !from.has(e.sourcePort))
      report(`schematic.edges.${key}.sourcePort`, "is not a port of its block")
    if (to && !to.has(e.targetPort))
      report(`schematic.edges.${key}.targetPort`, "is not a port of its block")
    if (e.source === e.target && e.sourcePort === e.targetPort)
      report(`schematic.edges.${key}`, "joins a port to itself")
    const ends = [`${e.source}.${e.sourcePort}`, `${e.target}.${e.targetPort}`].sort().join("|")
    if (pairs.has(ends)) report(`schematic.edges.${key}`, "repeats another wire")
    pairs.add(ends)
  }
  for (const [key, node] of Object.entries(nodes)) {
    const def = has(blockDefs, node.blockDefId) ? blockDefs[node.blockDefId] : undefined
    const params = new Set(def?.params.map((p) => p.key) ?? [])
    for (const p of Object.keys(node.paramValues))
      if (def && !params.has(p))
        report(`schematic.nodes.${key}.paramValues.${p}`, "is not a parameter of its block")
    const c = node.componentInstanceId
    if (c === undefined) continue
    const instance = has(doc.components, c) ? doc.components[c] : undefined
    if (!instance)
      report(`schematic.nodes.${key}.componentInstanceId`, "refers to something that is missing")
    else if (instance.nodeId !== node.id)
      report(
        `schematic.nodes.${key}.componentInstanceId`,
        "names a component that does not name it back"
      )
  }
}
