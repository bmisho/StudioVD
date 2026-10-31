import { gt2PitchDiameter } from "@/core/generators/pulley/gt2/profile"
import { estimated } from "@/core/generators/common"
import type { AnchorId, ConnectorKind, SceneDocument } from "@/core/schema"

/** What a new connector starts as when its kind has no better source (visual sizes). */
export const CONNECTOR_DEFAULTS = {
  belt: { widthMm: 6, thicknessMm: 1.4, radiusMm: 10, material: "std.rubber", name: "Belt" },
  tube: { outerMm: 4, leadMm: 10, material: "std.polyurethane", name: "Tube" },
  spring: { outerMm: 10, wireMm: 1, coils: 10, material: "std.steel", name: "Spring" },
} as const

export const CONNECTOR_SOURCES = [
  {
    what: "GT2 belt section",
    source: estimated("6 mm wide, about 1.4 mm thick (GT2 6 mm belts as sold)", "medium"),
  },
  {
    what: "Tube and spring sizes",
    source: estimated("Visual defaults: 4 mm pneumatic tube; Ø10 spring of 1 mm wire", "low"),
  },
]

/**
 * The radius a belt wraps an anchor's pulley at, and the belt width it suggests: a GT2
 * pulley's pitch radius and belt width from its generator parameters, a spur gear's pitch
 * radius, else the default.
 */
export function wheelOf(
  doc: Pick<SceneDocument, "anchors" | "parts" | "components" | "componentDefs">,
  id: AnchorId
): { radiusMm: number; widthMm?: number } {
  const anchor = Object.hasOwn(doc.anchors, id) ? doc.anchors[id] : undefined
  const ref =
    anchor && Object.hasOwn(doc.parts, anchor.partId)
      ? doc.parts[anchor.partId]?.componentRef
      : undefined
  const c =
    ref && Object.hasOwn(doc.components, ref.instance) ? doc.components[ref.instance] : undefined
  const def =
    c?.def && Object.hasOwn(doc.componentDefs, c.def) ? doc.componentDefs[c.def] : undefined
  const authoring = def?.manifest.authoring
  if (authoring?.kind === "generator") {
    const p = authoring.params
    if (authoring.generator === "pulley.gt2" && typeof p.teeth === "number")
      return {
        radiusMm: gt2PitchDiameter(p.teeth) / 2,
        ...(typeof p.beltWidthMm === "number" && { widthMm: p.beltWidthMm }),
      }
    if (
      authoring.generator === "gear.spur" &&
      typeof p.moduleMm === "number" &&
      typeof p.teeth === "number"
    )
      return { radiusMm: (p.moduleMm * p.teeth) / 2 }
  }
  return { radiusMm: CONNECTOR_DEFAULTS.belt.radiusMm }
}

/** How many ends each kind takes. */
export function endsFit(kind: ConnectorKind, count: number): boolean {
  return kind === "belt" ? count >= 2 && count <= 16 : count === 2
}
