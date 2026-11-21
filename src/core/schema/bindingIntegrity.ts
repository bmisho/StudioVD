import type { SceneDocument } from "./document"

// Binding references (PLAN 13.1): everything a binding names exists, a parameter it sets is a
// number or a switch, an input it drives is an input nothing else drives, and a block output
// it shows is one the block has.

const has = (record: object, id: string) => Object.hasOwn(record, id)

export function checkBindingRefs(
  doc: SceneDocument,
  report: (path: string, message: string) => void
): void {
  const missing = "refers to something that is missing"
  const { nodes, blockDefs, edges } = doc.schematic
  const defOf = (node: string) => {
    const n = has(nodes, node) ? nodes[node as keyof typeof nodes] : undefined
    return n && has(blockDefs, n.blockDefId) ? blockDefs[n.blockDefId] : undefined
  }
  const wired = new Set(Object.values(edges).map((e) => `${e.target}/${e.targetPort}`))
  const driven = new Set<string>()
  for (const [id, b] of Object.entries(doc.bindings)) {
    const at = `bindings.${id}`
    const f = b.from
    const t = b.to
    const refs: [string, object, string][] = []
    if ("mate" in f) refs.push(["from.mate", doc.mates, f.mate])
    if ("part" in f) refs.push(["from.part", doc.parts, f.part])
    if (f.kind === "contact") refs.push(["from.a", doc.parts, f.a], ["from.b", doc.parts, f.b])
    if (f.kind === "distance") refs.push(["from.a", doc.anchors, f.a], ["from.b", doc.anchors, f.b])
    if (f.kind === "range") refs.push(["from.anchor", doc.anchors, f.anchor])
    if (f.kind === "light")
      refs.push(["from.emitter", doc.anchors, f.emitter], ["from.sensor", doc.anchors, f.sensor])
    if ("node" in t) refs.push(["to.node", nodes, t.node])
    if ("part" in t) refs.push(["to.part", doc.parts, t.part])
    if ("anchor" in t) refs.push(["to.anchor", doc.anchors, t.anchor])
    if ("mate" in t) refs.push(["to.mate", doc.mates, t.mate])
    for (const [path, record, ref] of refs) if (!has(record, ref)) report(`${at}.${path}`, missing)

    if (f.kind === "light" || f.kind === "output") {
      const port = defOf(f.node)?.ports.find((p) => p.key === f.port)
      if (!port) report(`${at}.from.port`, "is not a port of that block")
      else if (f.kind === "light" && !(port.domain === "light" && port.direction === "out"))
        report(`${at}.from.port`, "is not a light output")
    }
    if (t.kind === "param") {
      const param = defOf(t.node)?.params.find((p) => p.key === t.param)
      if (!param) report(`${at}.to.param`, "is not a parameter of that block")
      else if (param.kind !== "number" && param.kind !== "bool")
        report(`${at}.to.param`, "takes no number")
    }
    if (t.kind === "input") {
      const id = `${t.node}/${t.port}`
      const port = defOf(t.node)?.ports.find((p) => p.key === t.port)
      if (!port || port.direction !== "in") report(`${at}.to.port`, "is not an input of that block")
      else if (wired.has(id) || driven.has(id)) report(`${at}.to.port`, "already has a driver")
      driven.add(id)
    }
  }
}
