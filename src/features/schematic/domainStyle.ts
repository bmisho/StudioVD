import { DOMAIN_LOOK, type DomainLook } from "@/core/schematic/domainLook"
import type { Domain } from "@/core/schema"

// Schematic domains in the canvas (CLAUDE.md §7): the shared look plus CSS for it.

export interface DomainStyle extends DomainLook {
  /** CSS colour (the theme variable). */
  color: string
  strokeWidth: number
  /** CSS clip-path of the port handle. */
  shape: string
}

const clipPath = (look: DomainLook) =>
  look.port === "circle"
    ? "circle(50%)"
    : `polygon(${look.port.map(([x, y]) => `${x * 100}% ${y * 100}%`).join(", ")})`

export const DOMAIN_STYLE = Object.fromEntries(
  Object.entries(DOMAIN_LOOK).map(([domain, look]) => [
    domain,
    { ...look, color: `var(${look.token})`, strokeWidth: look.wireWidth, shape: clipPath(look) },
  ])
) as Readonly<Record<Domain, DomainStyle>>
