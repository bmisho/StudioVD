import { useEffect, useMemo } from "react"
import { AdditiveBlending, Color, MeshBasicMaterial, type BufferGeometry } from "three"
import { useThree } from "@react-three/fiber"
import { useSimVisualStore } from "@/features/bindings/simVisualStore"
import { noRaycast } from "../picking/pickTarget"
import { useRedrawOnRemoval } from "../renderer/useRedrawOnRemoval"
import { readSceneTokens, type SceneTokens } from "../theme/sceneTokens"
import { OVERLAY } from "../thumbnail/overlay"

const GLOW_TOKEN: Readonly<Record<string, keyof SceneTokens>> = {
  red: "glowRed",
  green: "glowGreen",
  blue: "glowBlue",
  white: "glowWhite",
  yellow: "glowYellow",
  amber: "glowAmber",
}

/**
 * What a solve shows on a part (PLAN 13.1): it glows like a lit LED (additive, brighter the
 * more light), or it is tinted from cool to hot. Overlays on the part's own geometry, inside
 * its group so they follow it in test mode; never picked, left out of bounds and thumbnails.
 */
export function PartSimLook({ partId, geometry }: { partId: string; geometry: BufferGeometry }) {
  const glow = useSimVisualStore((s) => s.glow[partId])
  const color = useSimVisualStore((s) => s.glowColor[partId])
  const tint = useSimVisualStore((s) => s.tint[partId])
  const invalidate = useThree((s) => s.invalidate)
  useRedrawOnRemoval(`${glow === undefined}/${tint === undefined}`)
  const materials = useMemo(
    () => ({
      glow: new MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
      }),
      tint: new MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }),
    }),
    []
  )
  useEffect(
    () => () => {
      materials.glow.dispose()
      materials.tint.dispose()
    },
    [materials]
  )
  useEffect(() => {
    const tokens = readSceneTokens()
    if (glow !== undefined) {
      materials.glow.color.set(tokens[GLOW_TOKEN[color ?? "red"] ?? "glowRed"])
      materials.glow.opacity = 0.85 * glow
    }
    if (tint !== undefined)
      materials.tint.color.set(tokens.simCool).lerp(new Color(tokens.simHot), tint)
    materials.tint.opacity = 0.45
    invalidate()
  }, [glow, color, tint, materials, invalidate])
  return (
    <>
      {glow !== undefined && glow > 0 && (
        <mesh
          geometry={geometry}
          material={materials.glow}
          raycast={noRaycast}
          renderOrder={1}
          userData={OVERLAY}
        />
      )}
      {tint !== undefined && (
        <mesh
          geometry={geometry}
          material={materials.tint}
          raycast={noRaycast}
          renderOrder={1}
          userData={OVERLAY}
        />
      )}
    </>
  )
}
