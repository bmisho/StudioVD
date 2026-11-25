import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react"
import { wireLevel } from "@/features/simulation/readouts"
import { useSimulationStore } from "@/store/session/simulationStore"
import { DOMAIN_STYLE } from "./domainStyle"
import type { WireFlowEdge } from "./flowTypes"

/** A wire in its domain's colour and line pattern (CLAUDE.md §7); selected wires get a halo. */
export function WireEdge(props: EdgeProps<WireFlowEdge>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, data } =
    props
  const domain = data?.domain ?? "electrical"
  const style = DOMAIN_STYLE[domain]
  // Flow from the last solve (PLAN 12.9): direction and a speed class, not every value.
  const level = useSimulationStore((s) =>
    wireLevel(
      s.result,
      s.scales,
      { source: props.source, sourcePort: props.sourceHandleId ?? "" },
      domain
    )
  )
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
      {level !== 0 && (
        <path
          d={path}
          fill="none"
          stroke={style.color}
          strokeWidth={style.strokeWidth + 2.5}
          className={`sim-flow sim-flow-${Math.abs(level)}`}
          style={{ animationDirection: level < 0 ? "reverse" : "normal" }}
          pointerEvents="none"
          data-flow={level}
        />
      )}
    </>
  )
}
