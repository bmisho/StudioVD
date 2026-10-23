import { useEffect, useMemo } from "react"
import { BufferGeometry, Color, Float32BufferAttribute, Line, LineBasicMaterial } from "three"
import type { AnchorCandidate } from "@/core/assembly/snapCandidates"
import { add, cross, normalize, scale } from "@/core/math/vec3"
import { noRaycast } from "@/features/viewport/picking/pickTarget"
import { readSceneTokens } from "@/features/viewport/theme/sceneTokens"
import { OVERLAY } from "@/features/viewport/thumbnail/overlay"
import { GLYPH_ORDER } from "./glyphParts"

type Feature = NonNullable<AnchorCandidate["feature"]>

let material: LineBasicMaterial | null = null
const lineMaterial = () =>
  (material ??= new LineBasicMaterial({
    color: new Color(readSceneTokens().highlight),
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }))

/** Points along the edge or round the circle snapped to (part-local mm). */
function pointsOf(feature: Feature): number[] {
  if (feature.type === "segment") return [...feature.a, ...feature.b]
  const { centre, axis, radius } = feature
  const u = normalize(cross(axis, Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]))
  const w = cross(axis, u)
  const out: number[] = []
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI
    out.push(...add(centre, add(scale(u, radius * Math.cos(a)), scale(w, radius * Math.sin(a)))))
  }
  return out
}

/** The edge or circle the Place Anchor preview snapped to, drawn over the part. */
export function SnapFeatureLine({ feature }: { feature: Feature }) {
  const line = useMemo(() => {
    const geometry = new BufferGeometry()
    geometry.setAttribute("position", new Float32BufferAttribute(pointsOf(feature), 3))
    const l = new Line(geometry, lineMaterial())
    l.raycast = noRaycast
    l.renderOrder = GLYPH_ORDER
    l.userData = OVERLAY
    return l
  }, [feature])
  useEffect(() => () => line.geometry.dispose(), [line])
  return <primitive object={line} />
}
