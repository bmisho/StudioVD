import { assemblyGraph, type AssemblyGraph } from "@/core/assembly/assemblyGraph"
import type { SceneDocument } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"

let last: { parts: unknown; anchors: unknown; mates: unknown; graph: AssemblyGraph } | null = null

/** The assembly graph of these parts, anchors and mates: computed once per change of any. */
function graphOf(doc: Pick<SceneDocument, "parts" | "anchors" | "mates">): AssemblyGraph {
  if (last?.parts !== doc.parts || last.anchors !== doc.anchors || last.mates !== doc.mates)
    last = { parts: doc.parts, anchors: doc.anchors, mates: doc.mates, graph: assemblyGraph(doc) }
  return last.graph
}

/**
 * The document's assembly graph (PLAN 8.4): rigid groups, mechanisms, DOF and mate issues,
 * shared by the scene tree and the inspectors (one computation per document change).
 */
export function useAssemblyGraph(): AssemblyGraph {
  const parts = useDocumentStore((s) => s.doc.parts)
  const anchors = useDocumentStore((s) => s.doc.anchors)
  const mates = useDocumentStore((s) => s.doc.mates)
  return graphOf({ parts, anchors, mates })
}
