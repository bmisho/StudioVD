import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react"
import { DOMAIN_STYLE } from "./domainStyle"
import type { WireFlowEdge } from "./flowTypes"

/** A wire in its domain's colour and line pattern (CLAUDE.md §7); selected wires get a halo. */
export function WireEdge(props: EdgeProps<WireFlowEdge>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data } =
    props
  const style = DOMAIN_STYLE[data?.domain ?? "electrical"]
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 4,
    offset: 16,
  })
  return (
    <>
      {selected && (
        <path d={path} fill="none" stroke="var(--ring)" strokeWidth={style.strokeWidth + 4} />
      )}
      <BaseEdge
        id={props.id}
        path={path}
        interactionWidth={12}
        style={{
          stroke: style.color,
          strokeWidth: style.strokeWidth,
          strokeDasharray: style.dash,
          strokeLinecap: style.dash ? "round" : "butt",
        }}
      />
    </>
  )
}
