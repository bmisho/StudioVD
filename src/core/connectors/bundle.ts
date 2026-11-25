import type { AnchorId, Connector, SceneDocument } from "@/core/schema"

type Cable = Extract<Connector, { kind: "cable" }>

/**
 * The smallest circle holding n equal circles of diameter 1, n = 1…10 (optimal packings,
 * Kravitz 1967; the values tabulated by E. Specht's Packomania). Past ten, the density of a
 * large packing (about 0.82) is close enough for a zip tie.
 */
const PACKED = [1, 2, 2.1547, 2.4142, 2.7013, 3, 3, 3.3048, 3.6131, 3.813] as const

/** The cables that run through an anchor as one of their waypoints. */
export function cablesThrough(doc: Pick<SceneDocument, "connectors">, anchor: AnchorId): Cable[] {
  return Object.values(doc.connectors).filter(
    (c): c is Cable => c.kind === "cable" && c.via.includes(anchor)
  )
}

/**
 * The diameter (mm) of a bundle of these cables, each wire of each cable counted (a twisted
 * pair is two): the equal-circle packing for that many wires of the largest one's size, so a
 * tie sized to it closes round the bundle.
 */
export function bundleDiameterMm(
  cables: readonly { outerMm: number; conductors: number }[]
): number {
  const wires = cables.reduce((n, c) => n + c.conductors, 0)
  if (wires === 0) return 0
  const d = Math.max(...cables.map((c) => c.outerMm))
  const k = PACKED[wires - 1] ?? Math.sqrt(wires / 0.82)
  return d * k
}
