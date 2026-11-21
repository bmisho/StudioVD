import type { NodeProps } from "@xyflow/react"
import { labelAt, symbolAt, type PortSpot } from "@/core/schematic/layout"
import { SYMBOL_BOX, symbolPath } from "@/core/schematic/symbols"
import { cn } from "@/lib/utils"
import type { BlockFlowNode } from "./flowTypes"
import { BlockStatus } from "./BlockStatus"
import { PortHandle } from "./PortHandle"

/** A port's name where the layout puts it (the export draws it there too). */
function PortLabel({ spot, width }: { spot: PortSpot; width: number }) {
  const at = labelAt(spot, width)
  const box = 64
  const left = at.anchor === "start" ? at.x : at.anchor === "end" ? at.x - box : at.x - box / 2
  return (
    <span
      className="pointer-events-none absolute truncate text-xs leading-none text-muted-foreground"
      style={{ left, top: at.y - 10, width: box, textAlign: ANCHOR_ALIGN[at.anchor] }}
    >
      {spot.port.name}
    </span>
  )
}

const ANCHOR_ALIGN = { start: "left", end: "right", middle: "center" } as const

/** A schematic block: label, block name, built-in symbol and its ports (PLAN 11.3). */
export function BlockNode({ id, data, selected }: NodeProps<BlockFlowNode>) {
  const { def, layout, label, designator, linked } = data
  return (
    <div
      className={cn(
        "relative rounded-md border bg-background shadow-xs",
        selected
          ? "border-primary ring-2 ring-ring"
          : linked
            ? "border-2 border-dashed border-primary bg-accent-subtle"
            : "border-input"
      )}
      style={{ width: layout.width, height: layout.height }}
    >
      <div className="flex items-baseline gap-1 pt-1.5 pr-14 pl-2">
        <span className="truncate text-xs font-medium text-foreground">{label}</span>
        {linked && <span className="sr-only">(linked to the selected part)</span>}
        {designator && (
          <span className="text-xs text-muted-foreground tabular-nums">{designator}</span>
        )}
      </div>
      <div className="truncate pr-14 pl-2 text-xs text-muted-foreground">{def.name}</div>
      <svg
        aria-hidden
        className="pointer-events-none absolute text-foreground"
        style={{ left: symbolAt(layout.width).x, top: symbolAt(layout.width).y }}
        width={SYMBOL_BOX.width}
        height={SYMBOL_BOX.height}
        viewBox={`0 0 ${SYMBOL_BOX.width} ${SYMBOL_BOX.height}`}
      >
        <path
          d={symbolPath(def.symbol)}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {layout.ports.map((spot) => (
        <PortLabel key={`l-${spot.port.key}`} spot={spot} width={layout.width} />
      ))}
      {layout.ports.map((spot) => (
        <PortHandle key={spot.port.key} node={id} spot={spot} />
      ))}
      <BlockStatus node={id} simModel={def.simModel} />
    </div>
  )
}
