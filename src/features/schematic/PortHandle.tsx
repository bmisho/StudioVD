import { Handle, Position } from "@xyflow/react"
import type { PortSpot } from "@/core/schematic/layout"
import { cn } from "@/lib/utils"
import { DOMAIN_STYLE } from "./domainStyle"

const POSITION = {
  left: Position.Left,
  right: Position.Right,
  top: Position.Top,
  bottom: Position.Bottom,
} as const

const SIZE = 12

/**
 * One port (PLAN 11.2): shaped and coloured by its domain; a filled shape drives, a hollow one
 * is an input. Terminals connect either way (loose connection mode).
 */
export function PortHandle({ spot }: { spot: PortSpot }) {
  const { port } = spot
  const style = DOMAIN_STYLE[port.domain]
  const hollow = port.direction === "in"
  const unit = port.unit ? ` (${port.unit})` : ""
  return (
    <Handle
      id={port.key}
      type={port.direction === "in" ? "target" : "source"}
      position={POSITION[spot.side]}
      title={`${port.name}${unit}: ${style.name}${port.payload ? `, ${port.payload}` : ""}`}
      aria-label={`${port.name} port`}
      data-port={port.key}
      className={cn("!min-h-0 !min-w-0 !rounded-none !border-0")}
      style={{
        left: spot.x,
        top: spot.y,
        width: SIZE,
        height: SIZE,
        clipPath: style.shape,
        background: style.color,
        boxShadow: hollow ? "inset 0 0 0 2.5px var(--background)" : undefined,
        transform: "translate(-50%, -50%)",
        right: "auto",
        bottom: "auto",
      }}
    />
  )
}
