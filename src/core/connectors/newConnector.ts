import type { AnchorId, Connector, ConnectorId, MaterialId, SceneDocument } from "@/core/schema"
import { cableRoute, joinSpans, polylineLength } from "./cableRoute"
import { CONNECTOR_DEFAULTS, wheelOf } from "./defaults"
import { connectorFrames } from "./frames"

type Doc = Pick<SceneDocument, "anchors" | "parts" | "components" | "componentDefs">

interface Common {
  id: ConnectorId
  name: string
  materialId: MaterialId | null
  visible: boolean
}

/**
 * A new cable's length: its taut route plus 15% and 10 mm, rounded up to a whole millimetre,
 * so it starts with visible slack; the user sets the real length in the inspector.
 */
export function startingCableLength(
  doc: Doc,
  cable: Extract<Connector, { kind: "cable" }>
): number {
  const frames = connectorFrames(doc, cable)
  const route = frames ? polylineLength(joinSpans(cableRoute(frames, cable.leadMm, 1))) : 0
  return Math.max(1, Math.ceil(route * 1.15 + 10))
}

/**
 * A connector of `kind` on `anchors` (a cable's: start, waypoints..., end), sized from what
 * the anchors belong to (a pulley's pitch radius) or the defaults. Not yet validated.
 */
export function newConnector(
  doc: Doc,
  kind: Connector["kind"],
  anchors: readonly AnchorId[],
  common: Common
): Connector {
  const two: [AnchorId, AnchorId] = [
    anchors[0] as AnchorId,
    anchors[anchors.length - 1] as AnchorId,
  ]
  if (kind === "belt") {
    const wheels = anchors.map((a) => wheelOf(doc, a))
    return {
      ...common,
      kind,
      ends: anchors.map((anchor, i) => ({ anchor, radiusMm: wheels[i]?.radiusMm ?? 10 })),
      widthMm: wheels.find((w) => w.widthMm)?.widthMm ?? CONNECTOR_DEFAULTS.belt.widthMm,
      thicknessMm: CONNECTOR_DEFAULTS.belt.thicknessMm,
    }
  }
  if (kind === "tube") {
    const d = CONNECTOR_DEFAULTS.tube
    return { ...common, kind, ends: two, outerMm: d.outerMm, leadMm: d.leadMm }
  }
  if (kind === "spring") {
    const d = CONNECTOR_DEFAULTS.spring
    return { ...common, kind, ends: two, outerMm: d.outerMm, wireMm: d.wireMm, coils: d.coils }
  }
  const d = CONNECTOR_DEFAULTS.cable
  const cable: Extract<Connector, { kind: "cable" }> = {
    ...common,
    kind,
    ends: two,
    via: anchors.slice(1, -1),
    lengthMm: 1,
    outerMm: d.outerMm,
    conductors: 1,
    pitchMm: d.pitchMm,
    slack: "arc",
    leadMm: d.leadMm,
  }
  return { ...cable, lengthMm: startingCableLength(doc, cable) }
}
