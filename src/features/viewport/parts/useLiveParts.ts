import { useFrame } from "@react-three/fiber"
import { useMemo, useRef, useState } from "react"
import {
  connectorAnchors,
  type Anchor,
  type Connector,
  type Part,
  type PartId,
  type Pose,
} from "@/core/schema"
import { partObject } from "./partObjects"

/** Moves smaller than this (mm, or quaternion units) leave the connectors as they are. */
const EPSILON = 1e-4

const moved = (a: Pose, b: Pose) =>
  a.positionMm.some((v, i) => Math.abs(v - (b.positionMm[i] ?? v)) > EPSILON) ||
  a.quaternion.some((v, i) => Math.abs(v - (b.quaternion[i] ?? v)) > EPSILON)

/**
 * The parts belts, tubes and springs hang on, at their LIVE poses while test mode runs
 * (PLAN 10.6): read from the parts' scene objects, where the physics writes them after every
 * step. A frame with no visible move changes nothing, so a still assembly re-renders nothing;
 * outside test mode, the document's parts as they are.
 */
export function useLiveParts(
  parts: Record<PartId, Part>,
  anchors: Record<string, Anchor>,
  connectors: Record<string, Connector>,
  testMode: boolean
): Record<PartId, Part> {
  const hung = useMemo(() => {
    const ids = new Set<PartId>()
    for (const c of Object.values(connectors))
      for (const a of connectorAnchors(c)) {
        const anchor = Object.hasOwn(anchors, a) ? anchors[a] : undefined
        if (anchor) ids.add(anchor.partId)
      }
    return [...ids]
  }, [anchors, connectors])
  const [live, setLive] = useState<Map<PartId, Pose> | null>(null)
  // What the last frame set, for the next frame to compare with (written only there).
  const latest = useRef<Map<PartId, Pose> | null>(null)

  useFrame(() => {
    if (!testMode || hung.length === 0) {
      if (latest.current) {
        latest.current = null
        setLive(null)
      }
      return
    }
    let changed = false
    const next = new Map<PartId, Pose>()
    for (const id of hung) {
      const object = partObject(id)
      if (!object) continue
      const p = object.position
      const q = object.quaternion
      const pose: Pose = { positionMm: [p.x, p.y, p.z], quaternion: [q.x, q.y, q.z, q.w] }
      const before = latest.current?.get(id)
      if (!before || moved(before, pose)) changed = true
      next.set(id, changed ? pose : (before ?? pose))
    }
    if (!changed) return
    latest.current = next
    setLive(next)
  })

  return useMemo(() => {
    if (!testMode || !live) return parts
    const out = { ...parts }
    for (const [id, pose] of live) {
      const part = Object.hasOwn(parts, id) ? parts[id] : undefined
      if (part) out[id] = { ...part, pose }
    }
    return out
  }, [parts, live, testMode])
}
