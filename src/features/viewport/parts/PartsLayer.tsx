import { useMemo } from "react"
import { partShown } from "@/core/scene/partShown"
import { partsInSelection } from "@/core/scene/partsInSelection"
import { useAnchorGlyphs } from "@/features/assembly/useAnchorGlyphs"
import { useDocumentStore } from "@/store/document/documentStore"
import { useSessionStore } from "@/store/session/sessionStore"
import { PickRoot } from "../picking/PickRoot"
import { useViewport } from "@/features/viewport/ViewportContext"
import { PartView } from "./PartView"

/** All visible document parts, inside the pick root. */
export function PartsLayer() {
  const { partsRoot } = useViewport()
  const parts = useDocumentStore((s) => s.doc.parts)
  const groups = useDocumentStore((s) => s.doc.groups)
  const assets = useDocumentStore((s) => s.doc.assets)
  const selection = useSessionStore((s) => s.selection)
  const isolated = useSessionStore((s) => s.isolated)
  const shown = useMemo(() => (isolated ? new Set<string>(isolated) : null), [isolated])
  // immer keeps parts/groups referentially stable unless they change, so this is cheap.
  const highlighted = useMemo(
    () => partsInSelection({ parts, groups }, selection),
    [parts, groups, selection]
  )

  // Hidden parts are not mounted: three raycasts invisible objects (Raycaster ignores
  // `visible`), so mounting them would make them pickable.
  const mounted = useMemo(
    () =>
      Object.values(parts).flatMap((part) => {
        const asset = Object.hasOwn(assets, part.assetId) ? assets[part.assetId] : undefined
        return asset && partShown(part, shown) ? [{ part, asset }] : []
      }),
    [parts, assets, shown]
  )
  const mountedIds = useMemo(() => mounted.map(({ part }) => part.id), [mounted])
  const glyphs = useAnchorGlyphs(mountedIds, highlighted)

  return (
    <PickRoot ref={partsRoot}>
      {mounted.map(({ part, asset }) => (
        <PartView
          key={part.id}
          part={part}
          asset={asset}
          selected={highlighted.has(part.id)}
          glyphs={glyphs.get(part.id) ?? ""}
        />
      ))}
    </PickRoot>
  )
}
