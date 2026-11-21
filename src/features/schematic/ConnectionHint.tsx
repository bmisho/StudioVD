import { Panel, useConnection } from "@xyflow/react"
import { wireProblem } from "./useConnecting"

/** While a wire is dragged over a port it may not join, why not (PLAN 11.4). */
export function ConnectionHint() {
  const reason = useConnection((c) => {
    if (!c.inProgress || !c.toHandle || c.isValid !== false) return null
    const { fromHandle, toHandle } = c
    return wireProblem({
      source: fromHandle.nodeId,
      sourceHandle: fromHandle.id,
      target: toHandle.nodeId,
      targetHandle: toHandle.id,
    })
  })
  if (!reason) return null
  return (
    <Panel position="bottom-center">
      <p role="status" className="rounded-sm border bg-background px-2 py-1 text-xs text-warning">
        {reason}
      </p>
    </Panel>
  )
}
