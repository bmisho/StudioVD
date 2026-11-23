import type { Draft } from "immer"
import { CONNECTOR_DEFAULTS, endsFit } from "@/core/connectors/defaults"
import { newConnector } from "@/core/connectors/newConnector"
import {
  builtinByKey,
  materialFromBuiltin,
  reusableMaterial,
  uniqueMaterialName,
} from "@/core/materials/presets"
import {
  COLLECTION_CAPS,
  ConnectorSchema,
  connectorAnchors,
  newId,
  type AnchorId,
  type Connector,
  type ConnectorId,
  type ConnectorKind,
  type MaterialId,
  type SceneDocument,
} from "@/core/schema"
import type { Get, Set } from "./actionTypes"

/** What the inspector changes; `radii` are a belt's, in its ends' order. */
export interface ConnectorPatch {
  name?: string
  visible?: boolean
  materialId?: MaterialId | null
  widthMm?: number
  thicknessMm?: number
  outerMm?: number
  leadMm?: number
  wireMm?: number
  coils?: number
  radii?: number[]
  /** A cable's (PLAN 16.3). */
  lengthMm?: number
  pitchMm?: number
  conductors?: 1 | 2
  slack?: "arc" | "wave" | "coil"
}

export interface ConnectorActions {
  /** A belt, tube, spring or cable (start, waypoints..., end) between anchors (PLAN 9.6, 16.1). */
  addConnector: (kind: ConnectorKind, anchors: readonly AnchorId[]) => ConnectorId | null
  /** Invalid values (the schema's bounds) are ignored, like the other inspectors'. */
  updateConnector: (id: ConnectorId, patch: ConnectorPatch) => void
  deleteConnectors: (ids: readonly ConnectorId[]) => void
}

/**
 * Connectors whose anchors went go with them (PLAN 9.6: they hang on their anchors); a cable
 * whose waypoint went (a clip deleted) keeps its ends and is routed without it (16.1).
 */
export function pruneConnectors(doc: Draft<SceneDocument>): void {
  for (const [id, c] of Object.entries(doc.connectors)) {
    if (c.kind === "cable") c.via = c.via.filter((a) => Object.hasOwn(doc.anchors, a))
    if (connectorAnchors(c).some((a) => !Object.hasOwn(doc.anchors, a)))
      delete doc.connectors[id as ConnectorId]
  }
}

function patched(c: Connector, patch: ConnectorPatch): Connector {
  const { radii, ...rest } = patch
  const next = { ...c, ...rest } as Connector
  if (next.kind === "belt" && radii)
    next.ends = next.ends.map((e, i) => ({ ...e, radiusMm: radii[i] ?? e.radiusMm }))
  return next
}

export function connectorActions(set: Set, get: Get): ConnectorActions {
  return {
    addConnector: (kind, anchors) => {
      const doc = get().doc
      const known = anchors.filter((a) => Object.hasOwn(doc.anchors, a))
      if (!endsFit(kind, known.length) || new Set(known).size !== known.length) return null
      if (Object.keys(doc.connectors).length >= COLLECTION_CAPS.connectors) return null
      const d = CONNECTOR_DEFAULTS[kind]
      const builtin = builtinByKey(d.material)
      const reuse = builtin ? reusableMaterial(doc, builtin) : null
      const material =
        !reuse && builtin
          ? materialFromBuiltin(builtin, newId<MaterialId>(), uniqueMaterialName(doc, builtin.name))
          : null
      const id = newId<ConnectorId>()
      const common = {
        id,
        name: d.name,
        materialId: reuse?.id ?? material?.id ?? null,
        visible: true,
      }
      const connector = newConnector(doc, kind, known, common)
      if (!ConnectorSchema.safeParse(connector).success) return null
      if (material && Object.keys(doc.materials).length >= COLLECTION_CAPS.materials) return null
      set((s) => {
        if (material) s.doc.materials[material.id] = material
        s.doc.connectors[id] = connector
      })
      return id
    },
    updateConnector: (id, patch) => {
      const c = Object.hasOwn(get().doc.connectors, id) ? get().doc.connectors[id] : undefined
      if (!c) return
      if (patch.materialId && !Object.hasOwn(get().doc.materials, patch.materialId)) return
      const next = patched(c, patch)
      if (!ConnectorSchema.safeParse(next).success) return
      set((s) => {
        s.doc.connectors[id] = next
      })
    },
    deleteConnectors: (ids) =>
      set((s) => {
        for (const id of ids) delete s.doc.connectors[id]
      }),
  }
}
