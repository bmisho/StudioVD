import { memo, useCallback, useEffect, useMemo } from "react"
import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute, type Group } from "three"
import type { ClearPoint } from "@/core/connectors/cableClearance"
import { connectorMesh } from "@/core/connectors/connectorMesh"
import type { Rigid } from "@/core/math/rigid"
import type { Connector } from "@/core/schema"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore, type SelectionItem } from "@/store/session/sessionStore"
import { PartHighlight } from "../highlight/PartHighlight"
import { materialCache } from "../materials/materialCache"
import { ensureBoundsTree } from "../picking/bvh"
import { viewportHover } from "../picking/hoverStore"
import { setPickRef } from "../picking/pickTarget"
import { useIsHovered } from "../picking/useIsHovered"
import { useRedrawOnRemoval } from "../renderer/useRedrawOnRemoval"

/**
 * A belt, tube or spring (PLAN 9.6), rebuilt from its end anchors' frames whenever they (or
 * its own values) change: `signature` stands for both. Visual only: picked and highlighted
 * like a part, never in physics.
 */
export const ConnectorView = memo(
  function ConnectorView({
    connector,
    frames,
    clear,
    selected,
  }: {
    connector: Connector
    frames: readonly Rigid[]
    /** Keeps a cable out of the parts (design mode); in `signature` as the parts' places. */
    clear?: ClearPoint | undefined
    signature: string
    selected: boolean
  }) {
    const item = useMemo<SelectionItem>(
      () => ({ kind: "connector", id: connector.id }),
      [connector.id]
    )
    const hovered = useIsHovered(item)
    const xray = useSessionStore((s) => s.displayMode === "xray")
    const geometry = useMemo(() => {
      const mesh = connectorMesh(connector, frames, clear)
      if (!mesh) return null
      const g = new BufferGeometry()
      g.setAttribute("position", new Float32BufferAttribute(mesh.positions, 3))
      g.setAttribute("normal", new Float32BufferAttribute(mesh.normals, 3))
      g.setIndex(new Uint32BufferAttribute(mesh.indices, 1))
      g.computeBoundingSphere()
      ensureBoundsTree(g)
      return g
    }, [connector, frames, clear])
    useEffect(() => () => geometry?.dispose(), [geometry])
    const material = useDocumentStore((s) =>
      materialCache.get(
        connector.materialId
          ? { kind: "material", materialId: connector.materialId }
          : { kind: "default" },
        xray ? "xray" : "shaded",
        s.doc
      )
    )
    const register = useCallback(
      (group: Group | null) => (group ? setPickRef(group, item) : undefined),
      [item]
    )
    useEffect(() => () => viewportHover.clearIf(item), [item])
    useRedrawOnRemoval()
    if (!geometry) return null
    return (
      <group ref={register}>
        <mesh geometry={geometry} material={material} />
        <PartHighlight
          geometry={geometry}
          state={selected ? "selected" : hovered ? "hover" : "none"}
        />
      </group>
    )
  },
  (a, b) => a.signature === b.signature && a.selected === b.selected
)
