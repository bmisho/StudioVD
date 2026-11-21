import { mateName } from "@/core/bindings/describe"
import { CONSERVED_DOMAINS } from "@/core/schema/schematic"
import type { NodeId, SceneDocument } from "@/core/schema"

// What the binding editor offers in each list (PLAN 13.3), by name, sorted.

type Doc = Pick<SceneDocument, "parts" | "anchors" | "mates" | "schematic" | "bindings">

export interface Option {
  value: string
  label: string
}

const sorted = (o: Option[]) => o.sort((a, b) => a.label.localeCompare(b.label))

export const partOptions = (doc: Doc): Option[] =>
  sorted(Object.values(doc.parts).map((p) => ({ value: p.id, label: p.name })))

export const mateOptions = (doc: Doc, movingOnly = false): Option[] =>
  sorted(
    Object.values(doc.mates)
      .filter((m) => !movingOnly || m.type === "revolute" || m.type === "prismatic")
      .map((m) => ({ value: m.id, label: mateName(doc, m.id) }))
  )

export const anchorOptions = (doc: Doc): Option[] =>
  sorted(
    Object.values(doc.anchors).map((a) => ({
      value: a.id,
      label: `${doc.parts[a.partId]?.name ?? "?"} · ${a.name}`,
    }))
  )

export const nodeOptions = (doc: Doc): Option[] =>
  sorted(Object.values(doc.schematic.nodes).map((n) => ({ value: n.id, label: n.label })))

const defOf = (doc: Doc, node: string) => {
  const n = Object.hasOwn(doc.schematic.nodes, node)
    ? doc.schematic.nodes[node as NodeId]
    : undefined
  return n ? doc.schematic.blockDefs[n.blockDefId] : undefined
}

/** Parameters a bound number can set: numbers and switches. */
export const paramOptions = (doc: Doc, node: string): Option[] =>
  (defOf(doc, node)?.params ?? [])
    .filter((p) => p.kind === "number" || p.kind === "bool")
    .map((p) => ({ value: p.key, label: p.unit ? `${p.name} (${p.unit})` : p.name }))

/** Inputs nothing drives yet (a wire or another binding). */
export function inputOptions(doc: Doc, node: string, domain?: "light"): Option[] {
  const driven = new Set([
    ...Object.values(doc.schematic.edges).map((e) => `${e.target}/${e.targetPort}`),
    ...Object.values(doc.bindings).flatMap((b) =>
      b.to.kind === "input" ? [`${b.to.node}/${b.to.port}`] : []
    ),
  ])
  return (defOf(doc, node)?.ports ?? [])
    .filter((p) => p.direction === "in" && !driven.has(`${node}/${p.key}`))
    .filter((p) => (domain ? p.domain === domain : p.domain !== "light"))
    .map((p) => ({ value: p.key, label: p.name }))
}

/** What a block shows: signal outputs as values, conserved ports by effort or flow. */
export function outputOptions(doc: Doc, node: string, lightOnly = false): Option[] {
  return (defOf(doc, node)?.ports ?? []).flatMap((p) => {
    if (lightOnly)
      return p.domain === "light" && p.direction === "out" ? [{ value: p.key, label: p.name }] : []
    if (p.direction === "out") return [{ value: `${p.key}|value`, label: p.name }]
    if (!CONSERVED_DOMAINS.has(p.domain)) return []
    return [
      { value: `${p.key}|effort`, label: `${p.name} (${p.unit})` },
      { value: `${p.key}|flow`, label: `${p.name} flow` },
    ]
  })
}
