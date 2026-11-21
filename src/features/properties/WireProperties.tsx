import type { EdgeId, NodeId } from "@/core/schema"
import { portOf } from "@/core/sim/connections"
import { DOMAIN_STYLE } from "@/features/schematic/domainStyle"
import { useDocumentStore } from "@/store/document/documentStore"
import { PropertyField } from "./PropertyField"

/** A schematic wire: its domain and the two ports it joins. */
export function WireProperties({ id }: { id: EdgeId }) {
  const schematic = useDocumentStore((s) => s.doc.schematic)
  const edge = Object.hasOwn(schematic.edges, id) ? schematic.edges[id] : undefined
  if (!edge) return null
  const end = (node: NodeId, port: string) => {
    const label = schematic.nodes[node]?.label ?? "?"
    return `${label} · ${portOf({ schematic }, { node, port })?.name ?? port}`
  }
  const domain = portOf({ schematic }, { node: edge.source, port: edge.sourcePort })?.domain
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-xs font-medium text-muted-foreground">Wire</h3>
      {domain && <PropertyField label="Domain" value={DOMAIN_STYLE[domain].name} />}
      <PropertyField label="From" value={end(edge.source, edge.sourcePort)} />
      <PropertyField label="To" value={end(edge.target, edge.targetPort)} />
    </div>
  )
}
