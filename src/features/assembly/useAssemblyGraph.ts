import { assemblyGraph, type AssemblyGraph } from "@/core/assembly/assemblyGraph"
import { sameGraphInputs } from "@/core/assembly/graphInputs"
import type { SceneDocument } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"

type Doc = Pick<SceneDocument, "parts" | "anchors" | "mates">

let last: { doc: Doc; graph: AssemblyGraph } | null = null

/** The assembly graph of this document: recomputed only when what it reads changed. */
function graphOf(doc: Doc): AssemblyGraph {
  if (!last || !sameGraphInputs(last.doc, doc)) last = { doc, graph: assemblyGraph(doc) }
  else last.doc = doc // the next comparison starts from here (unchanged entries: same objects)
  return last.graph
}

/**
 * The document's assembly graph (PLAN 8.4): rigid groups, mechanisms, DOF and mate issues,
 * shared by the scene tree and the inspectors (one computation per change of what it reads:
 * renaming a part keeps it).
 */
export function useAssemblyGraph(): AssemblyGraph {
  const parts = useDocumentStore((s) => s.doc.parts)
  const anchors = useDocumentStore((s) => s.doc.anchors)
  const mates = useDocumentStore((s) => s.doc.mates)
  return graphOf({ parts, anchors, mates })
}
