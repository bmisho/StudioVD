import type { Connection, IsValidConnection } from "@xyflow/react"
import { useCallback } from "react"
import { CONNECT_TEXT, connectionProblem, isRefusal, type PortRef } from "@/core/sim/connections"
import type { NodeId } from "@/core/schema"
import { toastNotifier } from "@/lib/notify"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import type { WireFlowEdge } from "./flowTypes"

interface Ends {
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

const ends = (c: Ends) => {
  if (!c.sourceHandle || !c.targetHandle) return null
  const a: PortRef = { node: c.source as NodeId, port: c.sourceHandle }
  const b: PortRef = { node: c.target as NodeId, port: c.targetHandle }
  return [a, b] as const
}

/** Why a wire between two handles is refused, or null (PLAN 11.4). */
export function wireProblem(c: Ends): string | null {
  const pair = ends(c)
  if (!pair) return CONNECT_TEXT.missing
  const problem = connectionProblem(useDocumentStore.getState().doc, pair[0], pair[1])
  return problem ? CONNECT_TEXT[problem] : null
}

/** Connection rules for the canvas, and wiring a valid connection into the document. */
export function useConnecting() {
  const isValidConnection = useCallback<IsValidConnection<WireFlowEdge>>(
    (c) => wireProblem(c) === null,
    []
  )
  const onConnect = useCallback((c: Connection) => {
    const pair = ends(c)
    if (!pair) return
    const result = useDocumentStore.getState().connectPorts(pair[0], pair[1])
    if (isRefusal(result)) toastNotifier.warning("Not connected", CONNECT_TEXT[result])
    else useSessionStore.getState().select([{ kind: "edge", id: result }])
  }, [])
  return { isValidConnection, onConnect }
}
